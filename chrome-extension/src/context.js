class Context {
  static EXTENSION_SELECTOR_PREFIX = WhichExtension; // Keep
  static BOX_CLASS = `${Context.EXTENSION_SELECTOR_PREFIX}-box`; // Keep
  static BOX_SELECTOR = `.${Context.BOX_CLASS}`; // Keep
  static STYLE_ELEMENT_ID = `${Context.EXTENSION_SELECTOR_PREFIX}-style`;
  static DARK_BG_STYLE_ELEMENT_ID = 'dynamic-dark-background-style';
  static MOBILE_CLASS = 'mobile';

  static initialPageRightOffset = null;
  static pageProcessedForPositioning = false;

  static engines = {};
  static engine = {};
  static processEngine = {};
  static save = {};
  static settingsListeners = {};

  static boxes = [];
  static shadowStyleContent = "";

  static extpay = null;
  static extpayUser = null;

  /** @type {HTMLElement | null} */
  static rightColumnElement = null;
  static set rightColumn(value) {
    Context.rightColumnElement = value;
    // if (value) // wideColumn logic removed
    //   value.dataset.optisearchColumn = Context.get('wideColumn');
  }
  static get rightColumn() {
    return Context.rightColumnElement; // Keep getter
  }

  static centerColumn = null;

  /** Start the content script, should be run only once */
  static async run() {
    Context.extpay = ExtPay('optisearch');

    Context.docHead = document.head || document.documentElement;

    Context.save = await loadSettings();
    Context.engines = await loadEngines();
    const matches = Object.entries(Context.engines)
      .find(([_, { regex }]) => window.location.hostname.search(new RegExp(regex)) !== -1);
    if (!matches) {
      debug("Not valid engine");
      return;
    }
    Context.engineName = matches[0];
    Context.engine = Context.engines[Context.engineName];
    if (!Context.engine) {
      debug("Not valid engine");
      return;
    }
    debug(`${Context.engineName} — "${parseSearchParam()}"`);
    if (Context.engineName === Google && new URL(window.location.href).searchParams.get('tbm'))
      return;

    // Update color if the theme has somehow changed
    let prevBg = null;
    setInterval(() => {
      const bg = getBackgroundColor();
      if (bg === prevBg)
        return;
      prevBg = bg;
      Context.updateColor();
    }, 200);

    Context.checkPremiumSubscription();

    Context.initChat();
    await Context.injectStyle();

    Context.execute();
  }

  /** Parse document and execute tools, might be run multiple times if the parsing failed once */
  static async execute() {
    // Reset positioning flags for a new page execution context
    Context.initialPageRightOffset = null;
    Context.pageProcessedForPositioning = false;

    Context.centerColumn = await awaitElement(Context.engine.centerColumn);

    if (Context.engineName === Baidu && Context.centerColumn) {
      let oldSearchParam = parseSearchParam();
      const observer = setObserver(_ => {
        const searchParam = parseSearchParam();
        if (oldSearchParam === searchParam)
          return;
        oldSearchParam = searchParam;
        observer.disconnect();
        Context.execute();
      }, $('#wrapper_wrapper'), { childList: true });
    }

    Context.searchString = parseSearchParam();
    Context.setupRightColumn();
    Context.adjustPanelPosition(); // Call the new positioning function

    if (Context.engineName in Context.processEngine){
      Context.processEngine[Context.engineName]();
    }

    if (Context.computeIsOnMobile()) {
      debug("On Mobile !");
    } else if (!Context.rightColumn) {
      return;
    }

    chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
      if (message.type === 'updateSetting') {
        Context.save[message.key] = message.value;
        Context.dispatchUpdateSetting(message.key, message.value);
        // if (message.key === 'wideColumn') { // wideColumn logic removed
        //   Context.adjustPanelPosition();
        // }
      }
      sendResponse(true);
    });

    // window.addEventListener('resize', () => Context.adjustPanelPosition()); // Removed resize listener

    if (Context.chatSession && Context.chatSession.panel) {
      Context.appendPanel(Context.chatSession.panel);
      Context.adjustPanelPosition(); // Also call after panel is appended - Keep
    }
    if (typeof Sites !== 'undefined' && Context.parseResults) {
      Context.parseResults();
    }
  }

  static async checkIfUserStillNotPremium() {
    return Context.get('premium') === false && await Context.checkPremiumSubscription() === false;
  }

  /** 
   * Opens premium popup if the user doesn't have premium features.
   * Useful to use like this at the beginning of an onclick handler from a premium feature:
   * `if (await Context.handleNotPremium()) return;`
   * 
   * @returns {Promise<boolean>} true if the user DOESN'T have premium features
   */
  static async handleNotPremium() {
    // if(await Context.checkIfUserStillNotPremium()) { // Removed premium check
    //   premiumPresentationPopup();
    //   return true;
    // }
    return false; // Always return false, indicating user HAS premium (or rather, no check)
  }

  /**
   * Ask extpay API if the user is a premium user
   * @returns {Promise<true | false | null>} True if the user is a premium user, false otherwise and null if
   * there is an error.
   */
  static async checkPremiumSubscription() {
    await Context.extpay.getUser()
      .then(user => {
        Context.extpayUser = user;
        Context.set('premium', user.paid);
      })
      .catch(_ => {
        err(`Failed to retrieve user subscription state`);
        Context.set('premium', null);
      });
    return Context.get('premium');
  }

  static isActive(tool) {
    return !!Context.get(tool);
  }

  static get(saveKey) {
    return Context.save[saveKey];
  }
  
  static set(saveKey, value) {
    Context.save[saveKey] = value;
    saveSettings(Context.save);
    Context.dispatchUpdateSetting(saveKey, value);
  }

  static addSettingListener(key, callback) {
    Context.settingsListeners[key] ||= [];
    Context.settingsListeners[key].push(callback);
  }

  static dispatchUpdateSetting(key, value) {
    Context.settingsListeners[key]?.forEach(callback => callback(value));
  }

  static async injectStyle() {
    let styles = ['chatgpt', 'panel', 'code-light-theme', 'code-dark-theme'];
    if (isOptiSearch) styles.push('w3schools', 'wikipedia', 'genius');
    const cssContents = await Promise.all(styles.map(s => read(`src/styles/${s}.css`)));
    Context.shadowStyleContent = cssContents.join('\n');

    // Change style based on the search engine
    const globalStyleContent = await read(`src/styles/box.css`) + '\n' + Context.engine.style ?? '';
    el('style', {
      textContent: globalStyleContent.trim().replaceAll('.optisearchbox', Context.BOX_SELECTOR),
      id: `${Context.STYLE_ELEMENT_ID}-${EngineTechnicalNames[Context.engineName]}`,
    }, Context.docHead);
  }

  /**
   * Append pannel to the side of the result page
   * @param {Element} panel the content of the panel
   * @returns {Element} the box where the panel is 
   */
  static appendPanel(panel) {
    const buildTopButtons = () => {
      // Remove star (rate), crown (premium), and heart (donate) buttons
      const topButtonsContainer = el('div', { className: 'top-buttons-container headerhover' });
      // Example: Keep only a settings button if one existed, or leave empty
      // For now, returning an empty container or null if no buttons are left.
      // If there are other essential buttons, they should be preserved here.
      // Based on request, all specified buttons are removed.
      return topButtonsContainer; // Or return null if it should not be appended
    }

    // buildExpandArrow function is removed
    // const buildExpandArrow = () => { ... }

    const header = $('.optiheader', panel);
    if (header) {
      // header.prepend(el('div', { className: 'watermark', textContent: _t("optisearchName") }, header)); // Watermark removed

      const topButtons = buildTopButtons();
      if (topButtons && topButtons.hasChildNodes()) { // Only append if there are buttons
          header.prepend(topButtons);
      }

      // Remove expand arrow from rightButtonsContainer
      let rightButtonsContainer = $('.right-buttons-container', header);
      if (rightButtonsContainer) {
        const expandArrowEl = rightButtonsContainer.querySelector('.expand-arrow');
        if (expandArrowEl) {
          expandArrowEl.remove();
        }
        // If rightButtonsContainer is now empty and not needed for other things, it could also be removed.
        // For now, just removing the arrow.
      } else {
        // Ensure rightButtonsContainer exists if other buttons (like pause) are still there
        // rightButtonsContainer = el('div', { className: 'right-buttons-container headerhover' }, header);
        // header.append(rightButtonsContainer); // This line might be wrong, depends on original structure
      }
      // The original code appended buildExpandArrow to rightButtonsContainer.
      // Now we don't append it.
    }

    const box = el("div", { className: Context.BOX_CLASS });
    Context.boxes.push(box);
    if (Context.computeIsOnMobile())
      box.classList.add(Context.MOBILE_CLASS);

    const shadow = box.attachShadow({ mode: "open" });
    el("style", { textContent: Context.shadowStyleContent }, shadow);
    const texStyle = $("#MJX-SVG-styles");
    if (texStyle) el("style", { textContent: texStyle.textContent, id: texStyle.id }, shadow);
    shadow.append(panel);

    panel.classList.add(EngineTechnicalNames[Context.engineName], "bright");
    // $(`.expand-arrow`, panel)?.classList.toggle('rotated', Context.rightColumn.dataset.optisearchColumn === 'wide'); // expand-arrow removed

    Context.appendBoxes([box]);

    Context.updateColor();
    return box;
  }

  static appendBoxes(boxes) {
    const isOnMobile = Context.computeIsOnMobile();
    const firstResultRow = $(Context.engine.resultRow);
    let boxContainer = Context.rightColumn;

    if (isOnMobile)
      boxContainer = firstResultRow ? firstResultRow.parentElement : Context.centerColumn;
    if (!boxContainer)
      return;

    const startEl = $('.optisearch-start', boxContainer);

    boxes.forEach(box => {
      if (isOnMobile && firstResultRow) {
        boxContainer.insertBefore(box, firstResultRow);
        return;
      }

      if (!$('.optichat', box.shadowRoot)) {
        boxContainer.append(box);
        return;
      }

      const order = ['bard', 'bingchat', 'chatgpt'];
      const precedings = order
        .slice(0, order.indexOf(WhichChat))
        .map(e => boxes.filter(b => $(`.optichat.${e}`, b.shadowRoot)))
        .flat();
      if (precedings.length) {
        const lastPrecedingBox = precedings.at(-1);
        insertAfter(box, lastPrecedingBox);
        return;
      }
      if (startEl) {
        insertAfter(box, startEl);
        return;
      }

      boxContainer.prepend(box);
    });
  }

  /**
   * Parse or add right column to the results page.
   * Handle widening mechanism.
   */
  static setupRightColumn() {
    const rightColumnSelector = Context.engine.rightColumn;
    const selectorToDiv = (selector) => {
      const div = el('div');
      const selectorParts = [
        ...selector.split(',')[0].matchAll(/[\.#\[][^\.#,\[]+/g)
      ].map(a => a[0]);
      selectorParts.forEach(token => {
        switch (token[0]) {
          case '.': div.classList.add(token.slice(1)); break;
          case '#': div.id = token.slice(1); break;
          case '[': 
            const match = token.trim().slice(1, -1).match(/([^\]=]+)(?:=['"]?([^\]'"]+))?/);
            if (match) {
              match[2] ? div.setAttribute(match[1], match[2]) : div.toggleAttribute(match[1], true);
            }
        }
      });
      return div;
    }

    Context.rightColumn = $(rightColumnSelector);
    if (!Context.rightColumn) {
      if (!Context.centerColumn) {
        err("No center column detected");
        Context.rightColumn = null;
        return;
      }
      Context.rightColumn = selectorToDiv(rightColumnSelector);
      Context.rightColumn.classList.add('optisearch-created'); // Original class
      Context.rightColumn.classList.add('optisearch-column-positioned'); // Updated class name
      insertAfter(Context.rightColumn, Context.centerColumn);
    } else {
      // If it's an existing Google element, ensure it also gets the positioned class
      Context.rightColumn.classList.add('optisearch-column-positioned');
    }
    
    // const updateWideState = (value, start=false) => { // wideColumn logic removed
    //   if (!start && !$(`style.wide-column-transition`)) {
    //     el('style', {
    //       className: 'wide-column-transition',
    //       textContent: '.optisearch-column { transition: max-width var(--expand-time) linear, min-width var(--expand-time) linear ; }'
    //     }, Context.docHead);
    //   }
    //   Context.rightColumn.dataset.optisearchColumn = value ? 'wide' : 'thin';
    //   Context.boxes.forEach(box => {
    //     $(`.expand-arrow`, box.shadowRoot)?.classList.toggle('rotated', value)
    //   });
    // }
    // updateWideState(Context.get('wideColumn'), true); // wideColumn logic removed
    // Context.addSettingListener('wideColumn', updateWideState); // wideColumn logic removed

    // setObserver for data-optisearch-column removed
    // setObserver(mutations => {
    //   mutations.some(m => {
    //     if (m.attributeName !== "data-optisearch-column") return;
    //     if(!m.target.dataset.optisearchColumn) {
    //       Context.set('wideColumn', Context.get('wideColumn')); // to set again the column attribute
    //       return;
    //     }
    //     const isWide = m.target.dataset.optisearchColumn === 'wide';
    //     if (Context.get('wideColumn') !== isWide) {
    //       Context.set('wideColumn', isWide);
    //     }
    //   })
    // }, Context.rightColumn, { attributes: true });
  }

  static updateColor() {
    const bg = getBackgroundColor();
    const dark = isDarkMode();

    Context.boxes.map(box => box.shadowRoot).forEach(shadowRoot => {
      let style = $(`#${Context.DARK_BG_STYLE_ELEMENT_ID}`, shadowRoot);
      if (!style) {
        style = el('style', { id: Context.DARK_BG_STYLE_ELEMENT_ID });
        shadowRoot.prepend(style);
      }

      const panel = $(`.optipanel`, shadowRoot); 
      if (dark) {
        style.textContent = `
          .dark {background-color: ${colorLuminance(bg, 0.02)}}
          .dark .optibody.w3body .w3-example {background-color: ${colorLuminance(bg, 0.04)}}
        `;
      }
      panel.classList.toggle('dark', dark);
      panel.classList.toggle('bright', !dark);
    });
  }

  /** 
   * @returns {boolean} Are we on a mobile device
   */
  static computeIsOnMobile() {
    if (Context.engineName === DuckDuckGo) {
      const scriptInfo = [...document.querySelectorAll('script')].find(s => s.textContent.includes('isMobile'));
      if (!scriptInfo)
        return false;

      const isMobileMatch = scriptInfo.textContent.match(/"isMobile" *: *(false|true)/);
      if (isMobileMatch && isMobileMatch[1] === 'true')
        return true;

      return false;
    }

    if (!('onMobile' in Context.engine))
      return false;
    else if (typeof (Context.engine.onMobile) === 'number')
      return window.innerWidth < Context.engine.onMobile;
    return !!$(Context.engine.onMobile);
  }

  static adjustPanelPosition() {
    if (Context.computeIsOnMobile() || !Context.rightColumn || !Context.centerColumn) {
      if (Context.rightColumn) {
        Context.rightColumn.style.right = '';
        Context.rightColumn.style.position = '';
        Context.rightColumn.style.marginTop = '';
        Context.rightColumn.style.maxHeight = ''; // Clear maxHeight too
        Context.rightColumn.style.overflowY = '';
      }
      return;
    }

    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const centerColumnRect = Context.centerColumn.getBoundingClientRect();

    // Horizontal Positioning (only if not yet processed for this page view)
    if (!Context.pageProcessedForPositioning || Context.initialPageRightOffset === null) {
      const searchResultsRightEdge = centerColumnRect.right;
      const windowWidth = window.innerWidth;
      const spaceToRightOfResults = windowWidth - searchResultsRightEdge;
      const panelWidth = Context.rightColumn.offsetWidth; // This width is now fixed by CSS
      let calculatedRightOffset = (spaceToRightOfResults - panelWidth) / 2;

      if (spaceToRightOfResults < 0) { // Should not happen if centerColumn is correctly identified
        calculatedRightOffset = 0;
      } else {
        if (calculatedRightOffset < 0) {
          calculatedRightOffset = 0;
        }
        // Ensure it doesn't go off-screen if window is too narrow
        if (calculatedRightOffset + panelWidth > windowWidth) {
            calculatedRightOffset = windowWidth - panelWidth;
        }
        if (calculatedRightOffset < 0) calculatedRightOffset = 0;
      }
      Context.initialPageRightOffset = Math.max(0, calculatedRightOffset);
      Context.pageProcessedForPositioning = true;
    }

    Context.rightColumn.style.position = 'absolute';
    Context.rightColumn.style.right = `${Context.initialPageRightOffset}px`;

    // Vertical Positioning (always recalculate as scroll changes)
    Context.rightColumn.style.top = `${scrollTop + centerColumnRect.top}px`;

    // Max Height Calculation (always recalculate as footer position relative to viewport can change with scroll)
    Context.rightColumn.style.height = '';
    Context.rightColumn.style.overflowY = '';
    Context.rightColumn.style.marginLeft = '';

    // Restore some default vertical margin if needed, or rely on container's padding.
    // The .optisearchbox within will have its own margins if defined in box.css
    // For now, let the inner box's margin (if any) handle it.
    // Context.rightColumn.style.marginTop = '20px'; // Or manage via inner .optisearchbox margin

    // Attempt to prevent overlap with Google's footer
    const googleFooter = document.querySelector('#foot'); // Common selector for Google's footer
    if (googleFooter) {
      const panelRect = Context.rightColumn.getBoundingClientRect(); // Re-get after top is set
      const footerRect = googleFooter.getBoundingClientRect();
      const availableHeight = (scrollTop + footerRect.top) - (scrollTop + panelRect.top) - 20; // 20px margin from footer

      if (availableHeight > 50) { // Ensure there's a reasonable minimum height
        Context.rightColumn.style.maxHeight = `${availableHeight}px`;
        Context.rightColumn.style.overflowY = 'auto';
      } else {
        Context.rightColumn.style.maxHeight = ''; // Or a sensible min-height like '100px'
        Context.rightColumn.style.overflowY = '';
      }
    } else {
      Context.rightColumn.style.maxHeight = ''; // No footer found, remove constraint
      Context.rightColumn.style.overflowY = '';
    }
  }
}
