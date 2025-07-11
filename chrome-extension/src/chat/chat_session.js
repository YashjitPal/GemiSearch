class ChatSession {
  static debug = false;
  static #abstractError = "ChatSession is an abstract classes that cannot be instantiated.";
  static #abstractMethodError = "This method should be inherited";
  static #nameError = "The inherited class from ChatSession should be given a name";
  static #undefinedError = _t("Oups, an error occured. Please try again.");

  static errors = {};
  // static Mode = { // Mode.Discussion removed
  //   Text: 0,
  //   Discussion: 1,
  // };

  events = {};
  dispatch(event, ...data) {
    if (!(event in this.events)) return;
    this.events[event].forEach(ev => ev(...data));
  }
  listen(event, callback) {
    if (!(event in this.events)) this.events[event] = [];
    this.events[event].push(callback);
  }

  static infoHTML(content) {
    return `<div class="chat-info">${content}</div>`;
  }
  static get storageKey() {
    throw ChatSession.#abstractMethodError;
  }

  name = null;
  properties = {};
  session = null;
  /** @type {HTMLElement | null} */
  panel = null;
  currentAction = null;
  actionButton = null;
  lastError = null;
  // mode = ChatSession.Mode.Text; // mode property removed
  sendingAllowed = true;
  // deleteConversationAfter = true; // Removed

  discussion = new Discussion();

  constructor(name) {
    if (this.constructor === ChatSession)
      throw ChatSession.#abstractError;
    if (!name)
      throw ChatSession.#nameError;
    this.name = name;
    // window.addEventListener('beforeunload', () => { // Removed deleteConversationAfter logic
    //   if (this.deleteConversationAfter) {
    //     this.removeConversation();
    //   }
    // });
  }

  /**
   * Initialize the session by fetching the necessary stuff from the server
   */
  async init() {
    throw ChatSession.#abstractMethodError;
  }

  /**
   * Fetch credentials
   * @returns credentials
   */
  async fetchSession() {
    throw ChatSession.#abstractMethodError;
  }
  /**
   * @returns True if we can send a message, false if the nessesary configuration is invalid or has not been fetched yet
   */
  canSend() {
    return !!this.session;
  }

  /**
   * Send a prompt
   * @param {string} prompt
   * @returns credentials
   */
  async send(prompt) {
    if (this.constructor === ChatSession)
      throw ChatSession.#abstractMethodError;
    if (ChatSession.debug) {
      await new Promise(r => setTimeout(r, 2000));
      this.onMessage(ChatSession.infoHTML('🔍 Searching for: <strong>setInterval()</strong>'));
      await new Promise(r => setTimeout(r, 2000));
      this.onMessage(
        `<p><code>stdnum</code> is a Python module that provides functions to parse, validate and reformat standard numbers and codes in different formats. It contains a large collection of number formats<a href="https://github.com/arthurdejong/python-stdnum/" title="GitHub - arthurdejong/python-stdnum: A Python library to provide ..." class="source"><sup>1</sup></a> <a href="https://pypi.org/project/python-stdnum/" title="python-stdnum · PyPI" class="source"><sup>2</sup></a>. Basically any number or code that has some validation mechanism available or some common formatting is eligible for inclusion in this library<a href="https://pypi.org/project/python-stdnum/" title="python-stdnum · PyPI" class="source"><sup>2</sup></a>.</p>
        You can find more information about this module at <a href="https://arthurdejong.org/python-stdnum/">https://arthurdejong.org/python-stdnum/</a>
        <a href="https://pypi.org/project/python-stdnum/" title="python-stdnum · PyPI" class="source superscript">2</a>.`,
        `<div class="learnmore" 
        >Learn more&nbsp: <a class="source" href="https://github.com/arthurdejong/python-stdnum/" >1. github.com</a>
<a class="source" href="https://pypi.org/project/python-stdnum/" >2. pypi.org</a>
<a class="source" href="https://arthurdejong.org/python-stdnum/doc/1.8/index" more>3. arthurdejong.org</a>
<a class="source" href="https://pypi.org/project/python-stdnum-do/" more>4. pypi.org</a>
        <a class="showmore source" title="Show more" invisible=2>+ 2 more</a></div>`
      );
      this.allowSend();
      return;
    }
  }

  /**
   * Remove the conversation
   * @returns {Promise} Server result of the remove request
   */
  removeConversation() {
    if (this.constructor === ChatSession) {
      throw ChatSession.#abstractMethodError;
    }
  }

  createPanel(directchat = true) {

    const buildLearnMoreSection = (sources) => {
      const visibleCount = 2;
      const invisibleCount = Math.max(0, Object.keys(sources).length - visibleCount);
      const learnMoreSection = el('div', { className: 'learnmore less'});

      el('span', { textContent: `${_t("Learn more")}\xa0: `}, learnMoreSection);

      sources.forEach(({index, href}, i) => {
        const link = el('a', { className: 'source', href, textContent: `${index ?? i+1}. ${new URL(href).host}`}, learnMoreSection);
        if (i >= visibleCount) {
          link.setAttribute('more', '');
        }
        // To make sure they go to next line if there is not enough horizontal space in the panel
        learnMoreSection.append('\n');
      });

      const showMoreButton = el('a', {
        className:'showmore source',
        title: _t("Show more"),
        textContent: _t("+$n$ more", invisibleCount)
      }, learnMoreSection);
      showMoreButton.dataset.invisibleCount = invisibleCount;

      showMoreButton.addEventListener('click', () => {
        showMoreButton.parentElement.classList.remove('less');
        showMoreButton.remove();
      });
      return learnMoreSection;
    }

    const buildFootNote = () => {
      const hr = el('hr', { className: 'optifoot-hr' });
      hideElement(hr);
  
      const foot = el("div", { className: 'optifoot' });
      // this.listen('conversationModeSwitched', () => { // conversationModeSwitched event removed
      //   hideElement(hr);
      //   hideElement(foot);
      // });

      this.listen('onMessage', (_, sources) => {
        // if(this.mode !== ChatSession.Mode.Text) return; // mode property removed, assume always Text-like display
        foot.replaceChildren();
        if (!sources?.length) {
          hideElement(hr);
          return;
        }
        displayElement(hr);
        foot.append(buildLearnMoreSection(sources));
      });

      this.listen('clear', () => {
        hideElement(hr);
        foot.replaceChildren();
      });
      return [hr, foot];
    };

    const buildPanelSkeleton = () => {
      const panel = el("div", { className: `optipanel optichat ${WhichChat}` });
      panel.dataset.chat = this.name;
  
      const header = el("div", { className: 'optiheader' }, panel);
      header.innerHTML = `
        <div class="ai-name">
          <img alt="${this.properties.name} icon" width=32 height=32 src="${chrome.runtime.getURL('src/images/' + this.properties.icon)}" />
          <a href="${this.properties.href}" class="title chat-title">${this.properties.name}</a>
        </div>
      `;
      el('div', { className: 'right-buttons-container' }, header);
      
      hline(panel);
      el("div", { className: 'optibody' }, panel);
  
      panel.append(...buildFootNote());
  
      return panel;
    }

    const buildCharacterCounter = () => {
      const MAX_CHAR = 2000;
      const maxCharContainer = el('div', { className: 'max-char-container' });
      this.listen('textAreaChange', (value) => {
        if (value.length > MAX_CHAR) {
          value = value.slice(0, MAX_CHAR);
        }
        maxCharContainer.textContent = `${value.length}/${MAX_CHAR}`;
      });
      return maxCharContainer;
    }

    const buildSendButton = () => {
      const sendButton = el('div', {
        type: 'button',
        className: 'send-button',
        title: _t('Send message'),
      });
      setSvg(sendButton, SVG.send);
      this.listen('textAreaChange', (value) => {
        if (!value) {
          sendButton.setAttribute('disabled', '');
        } else {
          sendButton.removeAttribute('disabled');
        }
      });
      this.listen('allowSend', () => displayElement(sendButton));
      this.listen('disableSend', () => hideElement(sendButton));
      sendButton.addEventListener('click', () => this.sendTextArea());
      return sendButton;
    }
    
    const buildInfoContainer = () => {
      const infoContainer = el('div', { className: 'info-container' });
      infoContainer.append(
        buildCharacterCounter(),
        buildSendButton(),
      );
      return infoContainer;
    }

    const buildTextArea = () => {
      const textArea = el('textarea', {});
      const setTextAreaValue = (value) => {
        textArea.value = value;
        this.dispatch('textAreaChange', textArea.value);
      };
      this.sendTextArea = async () => {
        if (!this.sendingAllowed || !textArea.value) return;
        // if (await Context.handleNotPremium()) return; // Removed premium check
        this.setupAndSend(textArea.value);
        setTextAreaValue('');
      };
      this.listen('allowSend', () => {
        textArea.disabled = false;
        textArea.placeholder = _t('Ask me anything...');
      });
      this.listen('disableSend', () => {
        textArea.disabled = true;
        textArea.placeholder = _t('$AI$ is answering...', this.properties.name);
      });
      this.listen('conversationModeSwitched', () => {
        if (this.discussion.length === 0) {
          setTextAreaValue(parseSearchParam());
        } else {
          setTextAreaValue('');
        }
      });
      textArea.addEventListener('input', () => this.dispatch('textAreaChange', textArea.value));
      textArea.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          this.sendTextArea();
        }
      });
      return textArea;
    }

    const buildInputContainer = () => {
      const inputContainer = el('div', { className: 'input-container' });
      const updateInputContainerVisibility = () => {
        if (!!this.actionButton.textContent) {
          hideElement(inputContainer);
        } else {
          displayElement(inputContainer);
        }
      };
      updateInputContainerVisibility();
      this.listen('onMessage', updateInputContainerVisibility);
      this.listen('conversationModeSwitched', updateInputContainerVisibility);
      this.listen('clear', () => hideElement(inputContainer));

      inputContainer.append(
        // buildTextArea(), // Removed
        // buildInfoContainer(), // Removed
      );
      // Hide input container by default as it's no longer used for input
      hideElement(inputContainer);
      return inputContainer;
    }

    const buildChatContainer = () => {
      const chatContainer = el('div', { className: 'response-container' }); // Remains 'response-container'
      // this.listen('conversationModeSwitched', () => chatContainer.className = 'chat-container'); // Event removed
      chatContainer.append(
        this.discussion.el
        // buildInputContainer(), // Input container is removed from chat display area
      );
      return chatContainer;
    }
    
    /** Left buttons **/
    // const buildBookmarkButton = () => { ... } // Removed

    const buildChatButton = () => {
      const continueChatButton = el('div', {
        title: _t('Continue this chat on Gemini website'),
        className: 'continue-conversation-button',
      });
      setSvg(continueChatButton, SVG.chat);
      continueChatButton.addEventListener('click', () => {
        // Always redirect to gemini.google.com/app
        chrome.tabs.create({ url: 'https://gemini.google.com/app' });
      });

      return continueChatButton;
    }

    const buildLeftButtonsContainer = () => {
      const leftButtonsContainer = el('div', { className: 'left-buttons-container' });
      // leftButtonsContainer.append(buildBookmarkButton()); // Removed
      leftButtonsContainer.append(buildChatButton());
      return leftButtonsContainer;
    }

    const buildPauseButton = () => {
      const playPauseButton = el('div', { className: 'play-pause' });
      const setPlayPauseText = () => {
        setSvg(playPauseButton, SVG[Context.get('directchat') ? 'pause' : 'play'])
        playPauseButton.title = Context.get('directchat') ? _t('Pause auto-generation') : _t('Enable auto-generation')
        if (this.currentAction === 'send' && Context.get('directchat')) {
          this.setupAndSend();
        }
      };
      setPlayPauseText();
      playPauseButton.addEventListener('click', () => Context.set('directchat', !Context.get('directchat')));
      Context.addSettingListener('directchat', setPlayPauseText);
      return playPauseButton;
    }

    const buildActionButton = () => {
      const actionButton = el('button', { type: 'button', className: 'chatgpt-button' });
      this.listen('clear', () => hideElement(actionButton));
      return actionButton;
    }

    this.panel = buildPanelSkeleton();
    this.actionButton = buildActionButton();
    $('.optibody', this.panel).append(
      buildChatContainer(),
      this.actionButton,
    );
    $('.right-buttons-container', this.panel).append(buildPauseButton());
    insertAfter(buildLeftButtonsContainer(), $('.ai-name', this.panel));

    if (directchat) {
      this.setupAndSend();
    } else {
      this.setCurrentAction('send');
    }
    return this.panel;
  }

  onMessage(bodyHTML, sources) {
    this.discussion.setLastMessageHTML(bodyHTML);
    this.dispatch('onMessage', bodyHTML, sources);
  }

  onErrorMessage(error) {
    this.session = null;
    if (!error) {
      error = ChatSession.#undefinedError;
    }
    const isAction = error.button || error.action;
    const message = error.text ?? error;
    if (!isAction) {
      err(message);
    }
    this.onMessage(ChatSession.infoHTML(isAction ? message : `⚠️ ${message}`));
  }

  clear() {
    this.discussion.clear()
    this.dispatch('clear');
  }

  allowSend() {
    this.sendingAllowed = true;
    this.dispatch('allowSend');
  }

  disableSend() {
    this.sendingAllowed = false;
    this.dispatch('disableSend');
  }

  restartConversation() {
    // if (this.session && this.deleteConversationAfter) { // deleteConversationAfter removed
    //   this.removeConversation();
    // }
    if (this.session) { // Still remove if session exists, just not tied to deleteConversationAfter
        this.removeConversation();
    }
    this.session = null;
    this.clear();
    this.setupAndSend();
    // if (this.mode === ChatSession.Mode.Discussion) { // mode and Discussion mode removed
    //   this.dispatch('conversationModeSwitched', this.mode);
    // }
  }

  handleActionError(error) {
    this.lastError = error;
    this.session = null;
    if (error && error.code && error.text) {
      this.setCurrentAction(error.action ?? 'window');
    }
    this.onErrorMessage(error);
  }

  async setupAndSend(prompt) {
    if (!this.sendingAllowed) return;
    
    prompt = prompt ?? parseSearchParam();

    this.setCurrentAction(null);
    this.disableSend();
    this.discussion.appendMessage(new MessageContainer(Author.User, escapeHtml(prompt)));
    this.discussion.appendMessage(new MessageContainer(Author.Bot, ''));
    this.onMessage(ChatSession.infoHTML(_t("Waiting for <strong>$AI$</strong>...", this.properties.name)));
    try {
      if (!this.canSend()) {
        await this.init();
      }
      if (this.canSend()) {
        await this.send(prompt);
      }
    }
    catch (error) {
      this.handleActionError(error);
    }
  }

  setCurrentAction(action) {
    this.allowSend();
    const btn = this.actionButton;
    this.currentAction = action;
    if (action)
      displayElement(btn);
    switch (action) {
      case 'send':
        btn.textContent = _t('Ask $AI$', this.properties.name);
        btn.onclick = () => this.setupAndSend();
        break;
      case 'refresh':
        btn.textContent = _t('Refresh');
        btn.onclick = () => this.restartConversation();
        break;
      case 'window':
        btn.textContent = this.lastError.button;
        btn.onclick = () => {
          bgWorker({ action: 'window', url: this.lastError.url });
          this.setCurrentAction('refresh');
        }
        break;
      default:
        this.currentAction = null;
        btn.onclick = null;
        btn.textContent = '';
        hideElement(btn);
    }
  }
}
