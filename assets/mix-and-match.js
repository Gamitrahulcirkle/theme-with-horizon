if (!customElements.get('mix-and-match')) {
  customElements.define(
    'mix-and-match',
    class MixAndMatch extends HTMLElement {
      connectedCallback() {
        this.min = parseInt(this.dataset.min, 10) || 1;
        this.storageKey = `mix-and-match:${this.id}`;
        this.flavours = Array.from(this.querySelectorAll('.mm-flavour[data-variant-id]'));
        this.quantities = this.restore();
        this.buildStep = this.querySelector('[data-step="build"]');
        this.purchaseStep = this.querySelector('[data-step="purchase"]');
        this.frequency = this.querySelector('[data-frequency]');

        this.addEventListener('click', (event) => this.onClick(event));
        this.addEventListener('change', (event) => {
          if (event.target.matches('[data-frequency], input[type="radio"]')) this.renderPurchase();
        });
        this.render();
      }

      restore() {
        try {
          const saved = JSON.parse(sessionStorage.getItem(this.storageKey) || '{}');
          const valid = {};
          this.flavours.forEach((el) => {
            const id = el.dataset.variantId;
            if (saved[id] > 0 && !el.classList.contains('is-unavailable')) valid[id] = saved[id];
          });
          return valid;
        } catch (e) {
          return {};
        }
      }

      save() {
        try {
          sessionStorage.setItem(this.storageKey, JSON.stringify(this.quantities));
        } catch (e) {}
      }

      onClick(event) {
        const button = event.target.closest('[data-action]');
        if (!button || !this.contains(button)) return;
        const action = button.dataset.action;
        const flavour = button.closest('.mm-flavour');
        const lineId = button.dataset.variantId;

        if (action === 'add' || action === 'increase') this.change(flavour.dataset.variantId, 1, action === 'add');
        if (action === 'decrease') this.change(flavour.dataset.variantId, -1);
        if (action === 'remove') this.change(lineId, -Infinity);
        if (action === 'toggle-cart') {
          const cart = this.querySelector('.mm-cart');
          const open = cart.classList.toggle('is-open');
          button.setAttribute('aria-expanded', open);
        }
        if (action === 'continue') this.showStep('purchase');
        if (action === 'back') this.showStep('build');
        if (action === 'checkout') this.checkout(button);
      }

      change(id, delta, focusQty = false) {
        const next = Math.max(0, (this.quantities[id] || 0) + delta);
        if (next === 0) delete this.quantities[id];
        else this.quantities[id] = next;
        this.save();
        this.render();
        if (focusQty) {
          const flavour = this.querySelector(`.mm-flavour[data-variant-id="${id}"]`);
          flavour?.querySelector('[data-action="increase"]')?.focus();
        }
      }

      showStep(step) {
        this.buildStep.hidden = step !== 'build';
        this.purchaseStep.hidden = step !== 'purchase';
        if (step === 'purchase') this.renderPurchase();
        this.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      formatMoney(cents) {
        const format = this.dataset.moneyFormat || '${{amount}}';
        const value = (cents / 100).toFixed(2);
        const [whole, decimals] = value.split('.');
        const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        const withDots = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return format.replace(/\{\{\s*(\w+)\s*\}\}/, (match, key) => {
          switch (key) {
            case 'amount_no_decimals':
              return withCommas;
            case 'amount_with_comma_separator':
              return `${withDots},${decimals}`;
            case 'amount_no_decimals_with_comma_separator':
              return withDots;
            default:
              return `${withCommas}.${decimals}`;
          }
        });
      }

      get items() {
        return this.flavours
          .filter((el) => this.quantities[el.dataset.variantId] > 0)
          .map((el) => {
            const plans = {};
            (el.dataset.plans || '').split(',').filter(Boolean).forEach((entry) => {
              const [planId, price] = entry.split(':');
              plans[planId] = parseInt(price, 10);
            });
            return {
              id: el.dataset.variantId,
              title: el.dataset.title,
              group: el.dataset.group,
              image: el.dataset.image,
              price: parseInt(el.dataset.price, 10),
              plans,
              quantity: this.quantities[el.dataset.variantId],
            };
          });
      }

      render() {
        const items = this.items;
        const count = items.reduce((sum, item) => sum + item.quantity, 0);
        const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        this.count = count;

        this.flavours.forEach((el) => {
          const qty = this.quantities[el.dataset.variantId] || 0;
          const add = el.querySelector('.mm-flavour__add');
          const stepper = el.querySelector('.mm-qty');
          if (!add || !stepper) return;
          add.hidden = qty > 0;
          stepper.hidden = qty === 0;
          stepper.querySelector('.mm-qty__value').textContent = qty;
          el.classList.toggle('is-selected', qty > 0);
        });

        // Sidebar list grouped by product
        const list = this.querySelector('[data-list]');
        const groups = {};
        items.forEach((item) => (groups[item.group] = groups[item.group] || []).push(item));
        list.innerHTML = Object.entries(groups)
          .map(
            ([group, groupItems]) => `
            <div class="mm-cart__group">
              <p class="mm-cart__group-title">${this.escape(group)}</p>
              ${groupItems
                .map(
                  (item) => `
                <div class="mm-line">
                  <span class="mm-line__img">${item.image ? `<img src="${item.image}" alt="" width="32" height="32" loading="lazy">` : ''}</span>
                  <span class="mm-line__name">${this.escape(item.title)} x${item.quantity}</span>
                  <button type="button" class="mm-line__remove" data-action="remove" data-variant-id="${item.id}" aria-label="${this.escape(this.dataset.labelRemove.replace('[title]', item.title))}">
                    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg>
                  </button>
                  <span class="mm-line__price">${this.formatMoney(item.price * item.quantity)}</span>
                </div>`
                )
                .join('')}
            </div>`
          )
          .join('');

        this.querySelector('[data-empty]').hidden = items.length > 0;
        this.querySelector('[data-count]').textContent = count;
        this.querySelector('[data-bar]').style.width = `${Math.min(100, (count / this.min) * 100)}%`;
        this.querySelector('[data-total]').textContent = this.formatMoney(total);
        this.querySelectorAll('[data-items-added]').forEach(
          (el) => (el.textContent = this.dataset.labelItemsAdded.replace('[count]', count))
        );

        const button = this.querySelector('[data-action="continue"]');
        const remaining = this.min - count;
        button.disabled = remaining > 0;
        button.textContent =
          remaining > 1
            ? this.dataset.labelAddMore.replace('[count]', remaining)
            : remaining === 1
            ? this.dataset.labelAddMoreOne
            : this.dataset.labelContinue;

        if (!this.purchaseStep.hidden) {
          if (remaining > 0) this.showStep('build');
          else this.renderPurchase();
        }
      }

      renderPurchase() {
        const items = this.items;
        const planId = this.frequency?.value;
        const oneTime = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const flexible = items.reduce((sum, item) => {
          const planPrice = planId && item.plans[planId] !== undefined ? item.plans[planId] : item.price;
          return sum + planPrice * item.quantity;
        }, 0);
        const hasPlans = !!planId && items.some((item) => item.plans[planId] !== undefined);

        const flexOption = this.querySelector('[data-option="flexible"]');
        flexOption.hidden = !hasPlans;
        const flexRadio = flexOption.querySelector('input');
        const oneRadio = this.querySelector('[data-option="onetime"] input');
        if (!hasPlans) oneRadio.checked = true;

        this.querySelector('[data-flex-price]').textContent = this.formatMoney(flexible);
        this.querySelector('[data-flex-compare]').textContent = flexible < oneTime ? this.formatMoney(oneTime) : '';
        this.querySelector('[data-onetime-price]').textContent = this.formatMoney(oneTime);
        this.querySelectorAll('[data-items-label]').forEach(
          (el) => (el.textContent = this.dataset.labelItemsCount.replace('[count]', this.count))
        );
        const useFlex = hasPlans && flexRadio.checked;
        this.querySelector('[data-purchase-total]').textContent = this.formatMoney(useFlex ? flexible : oneTime);
        this.useFlexible = useFlex;
      }

      async checkout(button) {
        const error = this.querySelector('[data-error]');
        const label = button.querySelector('span');
        const original = label.textContent;
        error.hidden = true;
        button.disabled = true;
        label.textContent = this.dataset.labelCheckingOut;

        const planId = this.frequency?.value;
        const payload = this.items.map((item) => {
          const line = { id: parseInt(item.id, 10), quantity: item.quantity };
          if (this.useFlexible && planId && item.plans[planId] !== undefined) line.selling_plan = parseInt(planId, 10);
          return line;
        });

        try {
          const response = await fetch(`${this.dataset.cartAddUrl}.js`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ items: payload }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.description || data.message || this.dataset.labelError);
          sessionStorage.removeItem(this.storageKey);
          window.location.href = this.dataset.checkoutUrl;
        } catch (e) {
          error.textContent = e.message || this.dataset.labelError;
          error.hidden = false;
          button.disabled = false;
          label.textContent = original;
        }
      }

      escape(value) {
        const div = document.createElement('div');
        div.textContent = value;
        return div.innerHTML;
      }
    }
  );
}
