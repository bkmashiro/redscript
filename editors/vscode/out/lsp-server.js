#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../node_modules/vscode-languageserver/lib/common/utils/is.js
var require_is = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/utils/is.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.thenable = exports2.typedArray = exports2.stringArray = exports2.array = exports2.func = exports2.error = exports2.number = exports2.string = exports2.boolean = void 0;
    function boolean(value) {
      return value === true || value === false;
    }
    exports2.boolean = boolean;
    function string(value) {
      return typeof value === "string" || value instanceof String;
    }
    exports2.string = string;
    function number(value) {
      return typeof value === "number" || value instanceof Number;
    }
    exports2.number = number;
    function error(value) {
      return value instanceof Error;
    }
    exports2.error = error;
    function func(value) {
      return typeof value === "function";
    }
    exports2.func = func;
    function array(value) {
      return Array.isArray(value);
    }
    exports2.array = array;
    function stringArray(value) {
      return array(value) && value.every((elem) => string(elem));
    }
    exports2.stringArray = stringArray;
    function typedArray(value, check) {
      return Array.isArray(value) && value.every(check);
    }
    exports2.typedArray = typedArray;
    function thenable(value) {
      return value && func(value.then);
    }
    exports2.thenable = thenable;
  }
});

// ../../node_modules/vscode-jsonrpc/lib/common/is.js
var require_is2 = __commonJS({
  "../../node_modules/vscode-jsonrpc/lib/common/is.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.stringArray = exports2.array = exports2.func = exports2.error = exports2.number = exports2.string = exports2.boolean = void 0;
    function boolean(value) {
      return value === true || value === false;
    }
    exports2.boolean = boolean;
    function string(value) {
      return typeof value === "string" || value instanceof String;
    }
    exports2.string = string;
    function number(value) {
      return typeof value === "number" || value instanceof Number;
    }
    exports2.number = number;
    function error(value) {
      return value instanceof Error;
    }
    exports2.error = error;
    function func(value) {
      return typeof value === "function";
    }
    exports2.func = func;
    function array(value) {
      return Array.isArray(value);
    }
    exports2.array = array;
    function stringArray(value) {
      return array(value) && value.every((elem) => string(elem));
    }
    exports2.stringArray = stringArray;
  }
});

// ../../node_modules/vscode-jsonrpc/lib/common/messages.js
var require_messages = __commonJS({
  "../../node_modules/vscode-jsonrpc/lib/common/messages.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Message = exports2.NotificationType9 = exports2.NotificationType8 = exports2.NotificationType7 = exports2.NotificationType6 = exports2.NotificationType5 = exports2.NotificationType4 = exports2.NotificationType3 = exports2.NotificationType2 = exports2.NotificationType1 = exports2.NotificationType0 = exports2.NotificationType = exports2.RequestType9 = exports2.RequestType8 = exports2.RequestType7 = exports2.RequestType6 = exports2.RequestType5 = exports2.RequestType4 = exports2.RequestType3 = exports2.RequestType2 = exports2.RequestType1 = exports2.RequestType = exports2.RequestType0 = exports2.AbstractMessageSignature = exports2.ParameterStructures = exports2.ResponseError = exports2.ErrorCodes = void 0;
    var is = require_is2();
    var ErrorCodes;
    (function(ErrorCodes2) {
      ErrorCodes2.ParseError = -32700;
      ErrorCodes2.InvalidRequest = -32600;
      ErrorCodes2.MethodNotFound = -32601;
      ErrorCodes2.InvalidParams = -32602;
      ErrorCodes2.InternalError = -32603;
      ErrorCodes2.jsonrpcReservedErrorRangeStart = -32099;
      ErrorCodes2.serverErrorStart = -32099;
      ErrorCodes2.MessageWriteError = -32099;
      ErrorCodes2.MessageReadError = -32098;
      ErrorCodes2.PendingResponseRejected = -32097;
      ErrorCodes2.ConnectionInactive = -32096;
      ErrorCodes2.ServerNotInitialized = -32002;
      ErrorCodes2.UnknownErrorCode = -32001;
      ErrorCodes2.jsonrpcReservedErrorRangeEnd = -32e3;
      ErrorCodes2.serverErrorEnd = -32e3;
    })(ErrorCodes || (exports2.ErrorCodes = ErrorCodes = {}));
    var ResponseError = class _ResponseError extends Error {
      constructor(code, message, data) {
        super(message);
        this.code = is.number(code) ? code : ErrorCodes.UnknownErrorCode;
        this.data = data;
        Object.setPrototypeOf(this, _ResponseError.prototype);
      }
      toJson() {
        const result = {
          code: this.code,
          message: this.message
        };
        if (this.data !== void 0) {
          result.data = this.data;
        }
        return result;
      }
    };
    exports2.ResponseError = ResponseError;
    var ParameterStructures = class _ParameterStructures {
      constructor(kind) {
        this.kind = kind;
      }
      static is(value) {
        return value === _ParameterStructures.auto || value === _ParameterStructures.byName || value === _ParameterStructures.byPosition;
      }
      toString() {
        return this.kind;
      }
    };
    exports2.ParameterStructures = ParameterStructures;
    ParameterStructures.auto = new ParameterStructures("auto");
    ParameterStructures.byPosition = new ParameterStructures("byPosition");
    ParameterStructures.byName = new ParameterStructures("byName");
    var AbstractMessageSignature = class {
      constructor(method, numberOfParams) {
        this.method = method;
        this.numberOfParams = numberOfParams;
      }
      get parameterStructures() {
        return ParameterStructures.auto;
      }
    };
    exports2.AbstractMessageSignature = AbstractMessageSignature;
    var RequestType0 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 0);
      }
    };
    exports2.RequestType0 = RequestType0;
    var RequestType = class extends AbstractMessageSignature {
      constructor(method, _parameterStructures = ParameterStructures.auto) {
        super(method, 1);
        this._parameterStructures = _parameterStructures;
      }
      get parameterStructures() {
        return this._parameterStructures;
      }
    };
    exports2.RequestType = RequestType;
    var RequestType1 = class extends AbstractMessageSignature {
      constructor(method, _parameterStructures = ParameterStructures.auto) {
        super(method, 1);
        this._parameterStructures = _parameterStructures;
      }
      get parameterStructures() {
        return this._parameterStructures;
      }
    };
    exports2.RequestType1 = RequestType1;
    var RequestType2 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 2);
      }
    };
    exports2.RequestType2 = RequestType2;
    var RequestType3 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 3);
      }
    };
    exports2.RequestType3 = RequestType3;
    var RequestType4 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 4);
      }
    };
    exports2.RequestType4 = RequestType4;
    var RequestType5 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 5);
      }
    };
    exports2.RequestType5 = RequestType5;
    var RequestType6 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 6);
      }
    };
    exports2.RequestType6 = RequestType6;
    var RequestType7 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 7);
      }
    };
    exports2.RequestType7 = RequestType7;
    var RequestType8 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 8);
      }
    };
    exports2.RequestType8 = RequestType8;
    var RequestType9 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 9);
      }
    };
    exports2.RequestType9 = RequestType9;
    var NotificationType = class extends AbstractMessageSignature {
      constructor(method, _parameterStructures = ParameterStructures.auto) {
        super(method, 1);
        this._parameterStructures = _parameterStructures;
      }
      get parameterStructures() {
        return this._parameterStructures;
      }
    };
    exports2.NotificationType = NotificationType;
    var NotificationType0 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 0);
      }
    };
    exports2.NotificationType0 = NotificationType0;
    var NotificationType1 = class extends AbstractMessageSignature {
      constructor(method, _parameterStructures = ParameterStructures.auto) {
        super(method, 1);
        this._parameterStructures = _parameterStructures;
      }
      get parameterStructures() {
        return this._parameterStructures;
      }
    };
    exports2.NotificationType1 = NotificationType1;
    var NotificationType2 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 2);
      }
    };
    exports2.NotificationType2 = NotificationType2;
    var NotificationType3 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 3);
      }
    };
    exports2.NotificationType3 = NotificationType3;
    var NotificationType4 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 4);
      }
    };
    exports2.NotificationType4 = NotificationType4;
    var NotificationType5 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 5);
      }
    };
    exports2.NotificationType5 = NotificationType5;
    var NotificationType6 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 6);
      }
    };
    exports2.NotificationType6 = NotificationType6;
    var NotificationType7 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 7);
      }
    };
    exports2.NotificationType7 = NotificationType7;
    var NotificationType8 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 8);
      }
    };
    exports2.NotificationType8 = NotificationType8;
    var NotificationType9 = class extends AbstractMessageSignature {
      constructor(method) {
        super(method, 9);
      }
    };
    exports2.NotificationType9 = NotificationType9;
    var Message;
    (function(Message2) {
      function isRequest(message) {
        const candidate = message;
        return candidate && is.string(candidate.method) && (is.string(candidate.id) || is.number(candidate.id));
      }
      Message2.isRequest = isRequest;
      function isNotification(message) {
        const candidate = message;
        return candidate && is.string(candidate.method) && message.id === void 0;
      }
      Message2.isNotification = isNotification;
      function isResponse(message) {
        const candidate = message;
        return candidate && (candidate.result !== void 0 || !!candidate.error) && (is.string(candidate.id) || is.number(candidate.id) || candidate.id === null);
      }
      Message2.isResponse = isResponse;
    })(Message || (exports2.Message = Message = {}));
  }
});

// ../../node_modules/vscode-jsonrpc/lib/common/linkedMap.js
var require_linkedMap = __commonJS({
  "../../node_modules/vscode-jsonrpc/lib/common/linkedMap.js"(exports2) {
    "use strict";
    var _a;
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.LRUCache = exports2.LinkedMap = exports2.Touch = void 0;
    var Touch;
    (function(Touch2) {
      Touch2.None = 0;
      Touch2.First = 1;
      Touch2.AsOld = Touch2.First;
      Touch2.Last = 2;
      Touch2.AsNew = Touch2.Last;
    })(Touch || (exports2.Touch = Touch = {}));
    var LinkedMap = class {
      constructor() {
        this[_a] = "LinkedMap";
        this._map = /* @__PURE__ */ new Map();
        this._head = void 0;
        this._tail = void 0;
        this._size = 0;
        this._state = 0;
      }
      clear() {
        this._map.clear();
        this._head = void 0;
        this._tail = void 0;
        this._size = 0;
        this._state++;
      }
      isEmpty() {
        return !this._head && !this._tail;
      }
      get size() {
        return this._size;
      }
      get first() {
        return this._head?.value;
      }
      get last() {
        return this._tail?.value;
      }
      has(key) {
        return this._map.has(key);
      }
      get(key, touch = Touch.None) {
        const item = this._map.get(key);
        if (!item) {
          return void 0;
        }
        if (touch !== Touch.None) {
          this.touch(item, touch);
        }
        return item.value;
      }
      set(key, value, touch = Touch.None) {
        let item = this._map.get(key);
        if (item) {
          item.value = value;
          if (touch !== Touch.None) {
            this.touch(item, touch);
          }
        } else {
          item = { key, value, next: void 0, previous: void 0 };
          switch (touch) {
            case Touch.None:
              this.addItemLast(item);
              break;
            case Touch.First:
              this.addItemFirst(item);
              break;
            case Touch.Last:
              this.addItemLast(item);
              break;
            default:
              this.addItemLast(item);
              break;
          }
          this._map.set(key, item);
          this._size++;
        }
        return this;
      }
      delete(key) {
        return !!this.remove(key);
      }
      remove(key) {
        const item = this._map.get(key);
        if (!item) {
          return void 0;
        }
        this._map.delete(key);
        this.removeItem(item);
        this._size--;
        return item.value;
      }
      shift() {
        if (!this._head && !this._tail) {
          return void 0;
        }
        if (!this._head || !this._tail) {
          throw new Error("Invalid list");
        }
        const item = this._head;
        this._map.delete(item.key);
        this.removeItem(item);
        this._size--;
        return item.value;
      }
      forEach(callbackfn, thisArg) {
        const state = this._state;
        let current = this._head;
        while (current) {
          if (thisArg) {
            callbackfn.bind(thisArg)(current.value, current.key, this);
          } else {
            callbackfn(current.value, current.key, this);
          }
          if (this._state !== state) {
            throw new Error(`LinkedMap got modified during iteration.`);
          }
          current = current.next;
        }
      }
      keys() {
        const state = this._state;
        let current = this._head;
        const iterator = {
          [Symbol.iterator]: () => {
            return iterator;
          },
          next: () => {
            if (this._state !== state) {
              throw new Error(`LinkedMap got modified during iteration.`);
            }
            if (current) {
              const result = { value: current.key, done: false };
              current = current.next;
              return result;
            } else {
              return { value: void 0, done: true };
            }
          }
        };
        return iterator;
      }
      values() {
        const state = this._state;
        let current = this._head;
        const iterator = {
          [Symbol.iterator]: () => {
            return iterator;
          },
          next: () => {
            if (this._state !== state) {
              throw new Error(`LinkedMap got modified during iteration.`);
            }
            if (current) {
              const result = { value: current.value, done: false };
              current = current.next;
              return result;
            } else {
              return { value: void 0, done: true };
            }
          }
        };
        return iterator;
      }
      entries() {
        const state = this._state;
        let current = this._head;
        const iterator = {
          [Symbol.iterator]: () => {
            return iterator;
          },
          next: () => {
            if (this._state !== state) {
              throw new Error(`LinkedMap got modified during iteration.`);
            }
            if (current) {
              const result = { value: [current.key, current.value], done: false };
              current = current.next;
              return result;
            } else {
              return { value: void 0, done: true };
            }
          }
        };
        return iterator;
      }
      [(_a = Symbol.toStringTag, Symbol.iterator)]() {
        return this.entries();
      }
      trimOld(newSize) {
        if (newSize >= this.size) {
          return;
        }
        if (newSize === 0) {
          this.clear();
          return;
        }
        let current = this._head;
        let currentSize = this.size;
        while (current && currentSize > newSize) {
          this._map.delete(current.key);
          current = current.next;
          currentSize--;
        }
        this._head = current;
        this._size = currentSize;
        if (current) {
          current.previous = void 0;
        }
        this._state++;
      }
      addItemFirst(item) {
        if (!this._head && !this._tail) {
          this._tail = item;
        } else if (!this._head) {
          throw new Error("Invalid list");
        } else {
          item.next = this._head;
          this._head.previous = item;
        }
        this._head = item;
        this._state++;
      }
      addItemLast(item) {
        if (!this._head && !this._tail) {
          this._head = item;
        } else if (!this._tail) {
          throw new Error("Invalid list");
        } else {
          item.previous = this._tail;
          this._tail.next = item;
        }
        this._tail = item;
        this._state++;
      }
      removeItem(item) {
        if (item === this._head && item === this._tail) {
          this._head = void 0;
          this._tail = void 0;
        } else if (item === this._head) {
          if (!item.next) {
            throw new Error("Invalid list");
          }
          item.next.previous = void 0;
          this._head = item.next;
        } else if (item === this._tail) {
          if (!item.previous) {
            throw new Error("Invalid list");
          }
          item.previous.next = void 0;
          this._tail = item.previous;
        } else {
          const next = item.next;
          const previous = item.previous;
          if (!next || !previous) {
            throw new Error("Invalid list");
          }
          next.previous = previous;
          previous.next = next;
        }
        item.next = void 0;
        item.previous = void 0;
        this._state++;
      }
      touch(item, touch) {
        if (!this._head || !this._tail) {
          throw new Error("Invalid list");
        }
        if (touch !== Touch.First && touch !== Touch.Last) {
          return;
        }
        if (touch === Touch.First) {
          if (item === this._head) {
            return;
          }
          const next = item.next;
          const previous = item.previous;
          if (item === this._tail) {
            previous.next = void 0;
            this._tail = previous;
          } else {
            next.previous = previous;
            previous.next = next;
          }
          item.previous = void 0;
          item.next = this._head;
          this._head.previous = item;
          this._head = item;
          this._state++;
        } else if (touch === Touch.Last) {
          if (item === this._tail) {
            return;
          }
          const next = item.next;
          const previous = item.previous;
          if (item === this._head) {
            next.previous = void 0;
            this._head = next;
          } else {
            next.previous = previous;
            previous.next = next;
          }
          item.next = void 0;
          item.previous = this._tail;
          this._tail.next = item;
          this._tail = item;
          this._state++;
        }
      }
      toJSON() {
        const data = [];
        this.forEach((value, key) => {
          data.push([key, value]);
        });
        return data;
      }
      fromJSON(data) {
        this.clear();
        for (const [key, value] of data) {
          this.set(key, value);
        }
      }
    };
    exports2.LinkedMap = LinkedMap;
    var LRUCache = class extends LinkedMap {
      constructor(limit, ratio = 1) {
        super();
        this._limit = limit;
        this._ratio = Math.min(Math.max(0, ratio), 1);
      }
      get limit() {
        return this._limit;
      }
      set limit(limit) {
        this._limit = limit;
        this.checkTrim();
      }
      get ratio() {
        return this._ratio;
      }
      set ratio(ratio) {
        this._ratio = Math.min(Math.max(0, ratio), 1);
        this.checkTrim();
      }
      get(key, touch = Touch.AsNew) {
        return super.get(key, touch);
      }
      peek(key) {
        return super.get(key, Touch.None);
      }
      set(key, value) {
        super.set(key, value, Touch.Last);
        this.checkTrim();
        return this;
      }
      checkTrim() {
        if (this.size > this._limit) {
          this.trimOld(Math.round(this._limit * this._ratio));
        }
      }
    };
    exports2.LRUCache = LRUCache;
  }
});

// ../../node_modules/vscode-jsonrpc/lib/common/disposable.js
var require_disposable = __commonJS({
  "../../node_modules/vscode-jsonrpc/lib/common/disposable.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Disposable = void 0;
    var Disposable;
    (function(Disposable2) {
      function create(func) {
        return {
          dispose: func
        };
      }
      Disposable2.create = create;
    })(Disposable || (exports2.Disposable = Disposable = {}));
  }
});

// ../../node_modules/vscode-jsonrpc/lib/common/ral.js
var require_ral = __commonJS({
  "../../node_modules/vscode-jsonrpc/lib/common/ral.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var _ral;
    function RAL() {
      if (_ral === void 0) {
        throw new Error(`No runtime abstraction layer installed`);
      }
      return _ral;
    }
    (function(RAL2) {
      function install(ral) {
        if (ral === void 0) {
          throw new Error(`No runtime abstraction layer provided`);
        }
        _ral = ral;
      }
      RAL2.install = install;
    })(RAL || (RAL = {}));
    exports2.default = RAL;
  }
});

// ../../node_modules/vscode-jsonrpc/lib/common/events.js
var require_events = __commonJS({
  "../../node_modules/vscode-jsonrpc/lib/common/events.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Emitter = exports2.Event = void 0;
    var ral_1 = require_ral();
    var Event;
    (function(Event2) {
      const _disposable = { dispose() {
      } };
      Event2.None = function() {
        return _disposable;
      };
    })(Event || (exports2.Event = Event = {}));
    var CallbackList = class {
      add(callback, context = null, bucket) {
        if (!this._callbacks) {
          this._callbacks = [];
          this._contexts = [];
        }
        this._callbacks.push(callback);
        this._contexts.push(context);
        if (Array.isArray(bucket)) {
          bucket.push({ dispose: () => this.remove(callback, context) });
        }
      }
      remove(callback, context = null) {
        if (!this._callbacks) {
          return;
        }
        let foundCallbackWithDifferentContext = false;
        for (let i = 0, len = this._callbacks.length; i < len; i++) {
          if (this._callbacks[i] === callback) {
            if (this._contexts[i] === context) {
              this._callbacks.splice(i, 1);
              this._contexts.splice(i, 1);
              return;
            } else {
              foundCallbackWithDifferentContext = true;
            }
          }
        }
        if (foundCallbackWithDifferentContext) {
          throw new Error("When adding a listener with a context, you should remove it with the same context");
        }
      }
      invoke(...args) {
        if (!this._callbacks) {
          return [];
        }
        const ret = [], callbacks = this._callbacks.slice(0), contexts = this._contexts.slice(0);
        for (let i = 0, len = callbacks.length; i < len; i++) {
          try {
            ret.push(callbacks[i].apply(contexts[i], args));
          } catch (e) {
            (0, ral_1.default)().console.error(e);
          }
        }
        return ret;
      }
      isEmpty() {
        return !this._callbacks || this._callbacks.length === 0;
      }
      dispose() {
        this._callbacks = void 0;
        this._contexts = void 0;
      }
    };
    var Emitter = class _Emitter {
      constructor(_options) {
        this._options = _options;
      }
      /**
       * For the public to allow to subscribe
       * to events from this Emitter
       */
      get event() {
        if (!this._event) {
          this._event = (listener, thisArgs, disposables) => {
            if (!this._callbacks) {
              this._callbacks = new CallbackList();
            }
            if (this._options && this._options.onFirstListenerAdd && this._callbacks.isEmpty()) {
              this._options.onFirstListenerAdd(this);
            }
            this._callbacks.add(listener, thisArgs);
            const result = {
              dispose: () => {
                if (!this._callbacks) {
                  return;
                }
                this._callbacks.remove(listener, thisArgs);
                result.dispose = _Emitter._noop;
                if (this._options && this._options.onLastListenerRemove && this._callbacks.isEmpty()) {
                  this._options.onLastListenerRemove(this);
                }
              }
            };
            if (Array.isArray(disposables)) {
              disposables.push(result);
            }
            return result;
          };
        }
        return this._event;
      }
      /**
       * To be kept private to fire an event to
       * subscribers
       */
      fire(event) {
        if (this._callbacks) {
          this._callbacks.invoke.call(this._callbacks, event);
        }
      }
      dispose() {
        if (this._callbacks) {
          this._callbacks.dispose();
          this._callbacks = void 0;
        }
      }
    };
    exports2.Emitter = Emitter;
    Emitter._noop = function() {
    };
  }
});

// ../../node_modules/vscode-jsonrpc/lib/common/cancellation.js
var require_cancellation = __commonJS({
  "../../node_modules/vscode-jsonrpc/lib/common/cancellation.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CancellationTokenSource = exports2.CancellationToken = void 0;
    var ral_1 = require_ral();
    var Is = require_is2();
    var events_1 = require_events();
    var CancellationToken;
    (function(CancellationToken2) {
      CancellationToken2.None = Object.freeze({
        isCancellationRequested: false,
        onCancellationRequested: events_1.Event.None
      });
      CancellationToken2.Cancelled = Object.freeze({
        isCancellationRequested: true,
        onCancellationRequested: events_1.Event.None
      });
      function is(value) {
        const candidate = value;
        return candidate && (candidate === CancellationToken2.None || candidate === CancellationToken2.Cancelled || Is.boolean(candidate.isCancellationRequested) && !!candidate.onCancellationRequested);
      }
      CancellationToken2.is = is;
    })(CancellationToken || (exports2.CancellationToken = CancellationToken = {}));
    var shortcutEvent = Object.freeze(function(callback, context) {
      const handle = (0, ral_1.default)().timer.setTimeout(callback.bind(context), 0);
      return { dispose() {
        handle.dispose();
      } };
    });
    var MutableToken = class {
      constructor() {
        this._isCancelled = false;
      }
      cancel() {
        if (!this._isCancelled) {
          this._isCancelled = true;
          if (this._emitter) {
            this._emitter.fire(void 0);
            this.dispose();
          }
        }
      }
      get isCancellationRequested() {
        return this._isCancelled;
      }
      get onCancellationRequested() {
        if (this._isCancelled) {
          return shortcutEvent;
        }
        if (!this._emitter) {
          this._emitter = new events_1.Emitter();
        }
        return this._emitter.event;
      }
      dispose() {
        if (this._emitter) {
          this._emitter.dispose();
          this._emitter = void 0;
        }
      }
    };
    var CancellationTokenSource = class {
      get token() {
        if (!this._token) {
          this._token = new MutableToken();
        }
        return this._token;
      }
      cancel() {
        if (!this._token) {
          this._token = CancellationToken.Cancelled;
        } else {
          this._token.cancel();
        }
      }
      dispose() {
        if (!this._token) {
          this._token = CancellationToken.None;
        } else if (this._token instanceof MutableToken) {
          this._token.dispose();
        }
      }
    };
    exports2.CancellationTokenSource = CancellationTokenSource;
  }
});

// ../../node_modules/vscode-jsonrpc/lib/common/sharedArrayCancellation.js
var require_sharedArrayCancellation = __commonJS({
  "../../node_modules/vscode-jsonrpc/lib/common/sharedArrayCancellation.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SharedArrayReceiverStrategy = exports2.SharedArraySenderStrategy = void 0;
    var cancellation_1 = require_cancellation();
    var CancellationState;
    (function(CancellationState2) {
      CancellationState2.Continue = 0;
      CancellationState2.Cancelled = 1;
    })(CancellationState || (CancellationState = {}));
    var SharedArraySenderStrategy = class {
      constructor() {
        this.buffers = /* @__PURE__ */ new Map();
      }
      enableCancellation(request) {
        if (request.id === null) {
          return;
        }
        const buffer = new SharedArrayBuffer(4);
        const data = new Int32Array(buffer, 0, 1);
        data[0] = CancellationState.Continue;
        this.buffers.set(request.id, buffer);
        request.$cancellationData = buffer;
      }
      async sendCancellation(_conn, id) {
        const buffer = this.buffers.get(id);
        if (buffer === void 0) {
          return;
        }
        const data = new Int32Array(buffer, 0, 1);
        Atomics.store(data, 0, CancellationState.Cancelled);
      }
      cleanup(id) {
        this.buffers.delete(id);
      }
      dispose() {
        this.buffers.clear();
      }
    };
    exports2.SharedArraySenderStrategy = SharedArraySenderStrategy;
    var SharedArrayBufferCancellationToken = class {
      constructor(buffer) {
        this.data = new Int32Array(buffer, 0, 1);
      }
      get isCancellationRequested() {
        return Atomics.load(this.data, 0) === CancellationState.Cancelled;
      }
      get onCancellationRequested() {
        throw new Error(`Cancellation over SharedArrayBuffer doesn't support cancellation events`);
      }
    };
    var SharedArrayBufferCancellationTokenSource = class {
      constructor(buffer) {
        this.token = new SharedArrayBufferCancellationToken(buffer);
      }
      cancel() {
      }
      dispose() {
      }
    };
    var SharedArrayReceiverStrategy = class {
      constructor() {
        this.kind = "request";
      }
      createCancellationTokenSource(request) {
        const buffer = request.$cancellationData;
        if (buffer === void 0) {
          return new cancellation_1.CancellationTokenSource();
        }
        return new SharedArrayBufferCancellationTokenSource(buffer);
      }
    };
    exports2.SharedArrayReceiverStrategy = SharedArrayReceiverStrategy;
  }
});

// ../../node_modules/vscode-jsonrpc/lib/common/semaphore.js
var require_semaphore = __commonJS({
  "../../node_modules/vscode-jsonrpc/lib/common/semaphore.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Semaphore = void 0;
    var ral_1 = require_ral();
    var Semaphore = class {
      constructor(capacity = 1) {
        if (capacity <= 0) {
          throw new Error("Capacity must be greater than 0");
        }
        this._capacity = capacity;
        this._active = 0;
        this._waiting = [];
      }
      lock(thunk) {
        return new Promise((resolve2, reject) => {
          this._waiting.push({ thunk, resolve: resolve2, reject });
          this.runNext();
        });
      }
      get active() {
        return this._active;
      }
      runNext() {
        if (this._waiting.length === 0 || this._active === this._capacity) {
          return;
        }
        (0, ral_1.default)().timer.setImmediate(() => this.doRunNext());
      }
      doRunNext() {
        if (this._waiting.length === 0 || this._active === this._capacity) {
          return;
        }
        const next = this._waiting.shift();
        this._active++;
        if (this._active > this._capacity) {
          throw new Error(`To many thunks active`);
        }
        try {
          const result = next.thunk();
          if (result instanceof Promise) {
            result.then((value) => {
              this._active--;
              next.resolve(value);
              this.runNext();
            }, (err) => {
              this._active--;
              next.reject(err);
              this.runNext();
            });
          } else {
            this._active--;
            next.resolve(result);
            this.runNext();
          }
        } catch (err) {
          this._active--;
          next.reject(err);
          this.runNext();
        }
      }
    };
    exports2.Semaphore = Semaphore;
  }
});

// ../../node_modules/vscode-jsonrpc/lib/common/messageReader.js
var require_messageReader = __commonJS({
  "../../node_modules/vscode-jsonrpc/lib/common/messageReader.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ReadableStreamMessageReader = exports2.AbstractMessageReader = exports2.MessageReader = void 0;
    var ral_1 = require_ral();
    var Is = require_is2();
    var events_1 = require_events();
    var semaphore_1 = require_semaphore();
    var MessageReader;
    (function(MessageReader2) {
      function is(value) {
        let candidate = value;
        return candidate && Is.func(candidate.listen) && Is.func(candidate.dispose) && Is.func(candidate.onError) && Is.func(candidate.onClose) && Is.func(candidate.onPartialMessage);
      }
      MessageReader2.is = is;
    })(MessageReader || (exports2.MessageReader = MessageReader = {}));
    var AbstractMessageReader = class {
      constructor() {
        this.errorEmitter = new events_1.Emitter();
        this.closeEmitter = new events_1.Emitter();
        this.partialMessageEmitter = new events_1.Emitter();
      }
      dispose() {
        this.errorEmitter.dispose();
        this.closeEmitter.dispose();
      }
      get onError() {
        return this.errorEmitter.event;
      }
      fireError(error) {
        this.errorEmitter.fire(this.asError(error));
      }
      get onClose() {
        return this.closeEmitter.event;
      }
      fireClose() {
        this.closeEmitter.fire(void 0);
      }
      get onPartialMessage() {
        return this.partialMessageEmitter.event;
      }
      firePartialMessage(info) {
        this.partialMessageEmitter.fire(info);
      }
      asError(error) {
        if (error instanceof Error) {
          return error;
        } else {
          return new Error(`Reader received error. Reason: ${Is.string(error.message) ? error.message : "unknown"}`);
        }
      }
    };
    exports2.AbstractMessageReader = AbstractMessageReader;
    var ResolvedMessageReaderOptions;
    (function(ResolvedMessageReaderOptions2) {
      function fromOptions(options) {
        let charset;
        let result;
        let contentDecoder;
        const contentDecoders = /* @__PURE__ */ new Map();
        let contentTypeDecoder;
        const contentTypeDecoders = /* @__PURE__ */ new Map();
        if (options === void 0 || typeof options === "string") {
          charset = options ?? "utf-8";
        } else {
          charset = options.charset ?? "utf-8";
          if (options.contentDecoder !== void 0) {
            contentDecoder = options.contentDecoder;
            contentDecoders.set(contentDecoder.name, contentDecoder);
          }
          if (options.contentDecoders !== void 0) {
            for (const decoder of options.contentDecoders) {
              contentDecoders.set(decoder.name, decoder);
            }
          }
          if (options.contentTypeDecoder !== void 0) {
            contentTypeDecoder = options.contentTypeDecoder;
            contentTypeDecoders.set(contentTypeDecoder.name, contentTypeDecoder);
          }
          if (options.contentTypeDecoders !== void 0) {
            for (const decoder of options.contentTypeDecoders) {
              contentTypeDecoders.set(decoder.name, decoder);
            }
          }
        }
        if (contentTypeDecoder === void 0) {
          contentTypeDecoder = (0, ral_1.default)().applicationJson.decoder;
          contentTypeDecoders.set(contentTypeDecoder.name, contentTypeDecoder);
        }
        return { charset, contentDecoder, contentDecoders, contentTypeDecoder, contentTypeDecoders };
      }
      ResolvedMessageReaderOptions2.fromOptions = fromOptions;
    })(ResolvedMessageReaderOptions || (ResolvedMessageReaderOptions = {}));
    var ReadableStreamMessageReader = class extends AbstractMessageReader {
      constructor(readable, options) {
        super();
        this.readable = readable;
        this.options = ResolvedMessageReaderOptions.fromOptions(options);
        this.buffer = (0, ral_1.default)().messageBuffer.create(this.options.charset);
        this._partialMessageTimeout = 1e4;
        this.nextMessageLength = -1;
        this.messageToken = 0;
        this.readSemaphore = new semaphore_1.Semaphore(1);
      }
      set partialMessageTimeout(timeout) {
        this._partialMessageTimeout = timeout;
      }
      get partialMessageTimeout() {
        return this._partialMessageTimeout;
      }
      listen(callback) {
        this.nextMessageLength = -1;
        this.messageToken = 0;
        this.partialMessageTimer = void 0;
        this.callback = callback;
        const result = this.readable.onData((data) => {
          this.onData(data);
        });
        this.readable.onError((error) => this.fireError(error));
        this.readable.onClose(() => this.fireClose());
        return result;
      }
      onData(data) {
        try {
          this.buffer.append(data);
          while (true) {
            if (this.nextMessageLength === -1) {
              const headers = this.buffer.tryReadHeaders(true);
              if (!headers) {
                return;
              }
              const contentLength = headers.get("content-length");
              if (!contentLength) {
                this.fireError(new Error(`Header must provide a Content-Length property.
${JSON.stringify(Object.fromEntries(headers))}`));
                return;
              }
              const length = parseInt(contentLength);
              if (isNaN(length)) {
                this.fireError(new Error(`Content-Length value must be a number. Got ${contentLength}`));
                return;
              }
              this.nextMessageLength = length;
            }
            const body = this.buffer.tryReadBody(this.nextMessageLength);
            if (body === void 0) {
              this.setPartialMessageTimer();
              return;
            }
            this.clearPartialMessageTimer();
            this.nextMessageLength = -1;
            this.readSemaphore.lock(async () => {
              const bytes = this.options.contentDecoder !== void 0 ? await this.options.contentDecoder.decode(body) : body;
              const message = await this.options.contentTypeDecoder.decode(bytes, this.options);
              this.callback(message);
            }).catch((error) => {
              this.fireError(error);
            });
          }
        } catch (error) {
          this.fireError(error);
        }
      }
      clearPartialMessageTimer() {
        if (this.partialMessageTimer) {
          this.partialMessageTimer.dispose();
          this.partialMessageTimer = void 0;
        }
      }
      setPartialMessageTimer() {
        this.clearPartialMessageTimer();
        if (this._partialMessageTimeout <= 0) {
          return;
        }
        this.partialMessageTimer = (0, ral_1.default)().timer.setTimeout((token, timeout) => {
          this.partialMessageTimer = void 0;
          if (token === this.messageToken) {
            this.firePartialMessage({ messageToken: token, waitingTime: timeout });
            this.setPartialMessageTimer();
          }
        }, this._partialMessageTimeout, this.messageToken, this._partialMessageTimeout);
      }
    };
    exports2.ReadableStreamMessageReader = ReadableStreamMessageReader;
  }
});

// ../../node_modules/vscode-jsonrpc/lib/common/messageWriter.js
var require_messageWriter = __commonJS({
  "../../node_modules/vscode-jsonrpc/lib/common/messageWriter.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WriteableStreamMessageWriter = exports2.AbstractMessageWriter = exports2.MessageWriter = void 0;
    var ral_1 = require_ral();
    var Is = require_is2();
    var semaphore_1 = require_semaphore();
    var events_1 = require_events();
    var ContentLength = "Content-Length: ";
    var CRLF = "\r\n";
    var MessageWriter;
    (function(MessageWriter2) {
      function is(value) {
        let candidate = value;
        return candidate && Is.func(candidate.dispose) && Is.func(candidate.onClose) && Is.func(candidate.onError) && Is.func(candidate.write);
      }
      MessageWriter2.is = is;
    })(MessageWriter || (exports2.MessageWriter = MessageWriter = {}));
    var AbstractMessageWriter = class {
      constructor() {
        this.errorEmitter = new events_1.Emitter();
        this.closeEmitter = new events_1.Emitter();
      }
      dispose() {
        this.errorEmitter.dispose();
        this.closeEmitter.dispose();
      }
      get onError() {
        return this.errorEmitter.event;
      }
      fireError(error, message, count) {
        this.errorEmitter.fire([this.asError(error), message, count]);
      }
      get onClose() {
        return this.closeEmitter.event;
      }
      fireClose() {
        this.closeEmitter.fire(void 0);
      }
      asError(error) {
        if (error instanceof Error) {
          return error;
        } else {
          return new Error(`Writer received error. Reason: ${Is.string(error.message) ? error.message : "unknown"}`);
        }
      }
    };
    exports2.AbstractMessageWriter = AbstractMessageWriter;
    var ResolvedMessageWriterOptions;
    (function(ResolvedMessageWriterOptions2) {
      function fromOptions(options) {
        if (options === void 0 || typeof options === "string") {
          return { charset: options ?? "utf-8", contentTypeEncoder: (0, ral_1.default)().applicationJson.encoder };
        } else {
          return { charset: options.charset ?? "utf-8", contentEncoder: options.contentEncoder, contentTypeEncoder: options.contentTypeEncoder ?? (0, ral_1.default)().applicationJson.encoder };
        }
      }
      ResolvedMessageWriterOptions2.fromOptions = fromOptions;
    })(ResolvedMessageWriterOptions || (ResolvedMessageWriterOptions = {}));
    var WriteableStreamMessageWriter = class extends AbstractMessageWriter {
      constructor(writable, options) {
        super();
        this.writable = writable;
        this.options = ResolvedMessageWriterOptions.fromOptions(options);
        this.errorCount = 0;
        this.writeSemaphore = new semaphore_1.Semaphore(1);
        this.writable.onError((error) => this.fireError(error));
        this.writable.onClose(() => this.fireClose());
      }
      async write(msg) {
        return this.writeSemaphore.lock(async () => {
          const payload = this.options.contentTypeEncoder.encode(msg, this.options).then((buffer) => {
            if (this.options.contentEncoder !== void 0) {
              return this.options.contentEncoder.encode(buffer);
            } else {
              return buffer;
            }
          });
          return payload.then((buffer) => {
            const headers = [];
            headers.push(ContentLength, buffer.byteLength.toString(), CRLF);
            headers.push(CRLF);
            return this.doWrite(msg, headers, buffer);
          }, (error) => {
            this.fireError(error);
            throw error;
          });
        });
      }
      async doWrite(msg, headers, data) {
        try {
          await this.writable.write(headers.join(""), "ascii");
          return this.writable.write(data);
        } catch (error) {
          this.handleError(error, msg);
          return Promise.reject(error);
        }
      }
      handleError(error, msg) {
        this.errorCount++;
        this.fireError(error, msg, this.errorCount);
      }
      end() {
        this.writable.end();
      }
    };
    exports2.WriteableStreamMessageWriter = WriteableStreamMessageWriter;
  }
});

// ../../node_modules/vscode-jsonrpc/lib/common/messageBuffer.js
var require_messageBuffer = __commonJS({
  "../../node_modules/vscode-jsonrpc/lib/common/messageBuffer.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.AbstractMessageBuffer = void 0;
    var CR = 13;
    var LF = 10;
    var CRLF = "\r\n";
    var AbstractMessageBuffer = class {
      constructor(encoding = "utf-8") {
        this._encoding = encoding;
        this._chunks = [];
        this._totalLength = 0;
      }
      get encoding() {
        return this._encoding;
      }
      append(chunk) {
        const toAppend = typeof chunk === "string" ? this.fromString(chunk, this._encoding) : chunk;
        this._chunks.push(toAppend);
        this._totalLength += toAppend.byteLength;
      }
      tryReadHeaders(lowerCaseKeys = false) {
        if (this._chunks.length === 0) {
          return void 0;
        }
        let state = 0;
        let chunkIndex = 0;
        let offset = 0;
        let chunkBytesRead = 0;
        row: while (chunkIndex < this._chunks.length) {
          const chunk = this._chunks[chunkIndex];
          offset = 0;
          column: while (offset < chunk.length) {
            const value = chunk[offset];
            switch (value) {
              case CR:
                switch (state) {
                  case 0:
                    state = 1;
                    break;
                  case 2:
                    state = 3;
                    break;
                  default:
                    state = 0;
                }
                break;
              case LF:
                switch (state) {
                  case 1:
                    state = 2;
                    break;
                  case 3:
                    state = 4;
                    offset++;
                    break row;
                  default:
                    state = 0;
                }
                break;
              default:
                state = 0;
            }
            offset++;
          }
          chunkBytesRead += chunk.byteLength;
          chunkIndex++;
        }
        if (state !== 4) {
          return void 0;
        }
        const buffer = this._read(chunkBytesRead + offset);
        const result = /* @__PURE__ */ new Map();
        const headers = this.toString(buffer, "ascii").split(CRLF);
        if (headers.length < 2) {
          return result;
        }
        for (let i = 0; i < headers.length - 2; i++) {
          const header = headers[i];
          const index = header.indexOf(":");
          if (index === -1) {
            throw new Error(`Message header must separate key and value using ':'
${header}`);
          }
          const key = header.substr(0, index);
          const value = header.substr(index + 1).trim();
          result.set(lowerCaseKeys ? key.toLowerCase() : key, value);
        }
        return result;
      }
      tryReadBody(length) {
        if (this._totalLength < length) {
          return void 0;
        }
        return this._read(length);
      }
      get numberOfBytes() {
        return this._totalLength;
      }
      _read(byteCount) {
        if (byteCount === 0) {
          return this.emptyBuffer();
        }
        if (byteCount > this._totalLength) {
          throw new Error(`Cannot read so many bytes!`);
        }
        if (this._chunks[0].byteLength === byteCount) {
          const chunk = this._chunks[0];
          this._chunks.shift();
          this._totalLength -= byteCount;
          return this.asNative(chunk);
        }
        if (this._chunks[0].byteLength > byteCount) {
          const chunk = this._chunks[0];
          const result2 = this.asNative(chunk, byteCount);
          this._chunks[0] = chunk.slice(byteCount);
          this._totalLength -= byteCount;
          return result2;
        }
        const result = this.allocNative(byteCount);
        let resultOffset = 0;
        let chunkIndex = 0;
        while (byteCount > 0) {
          const chunk = this._chunks[chunkIndex];
          if (chunk.byteLength > byteCount) {
            const chunkPart = chunk.slice(0, byteCount);
            result.set(chunkPart, resultOffset);
            resultOffset += byteCount;
            this._chunks[chunkIndex] = chunk.slice(byteCount);
            this._totalLength -= byteCount;
            byteCount -= byteCount;
          } else {
            result.set(chunk, resultOffset);
            resultOffset += chunk.byteLength;
            this._chunks.shift();
            this._totalLength -= chunk.byteLength;
            byteCount -= chunk.byteLength;
          }
        }
        return result;
      }
    };
    exports2.AbstractMessageBuffer = AbstractMessageBuffer;
  }
});

// ../../node_modules/vscode-jsonrpc/lib/common/connection.js
var require_connection = __commonJS({
  "../../node_modules/vscode-jsonrpc/lib/common/connection.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createMessageConnection = exports2.ConnectionOptions = exports2.MessageStrategy = exports2.CancellationStrategy = exports2.CancellationSenderStrategy = exports2.CancellationReceiverStrategy = exports2.RequestCancellationReceiverStrategy = exports2.IdCancellationReceiverStrategy = exports2.ConnectionStrategy = exports2.ConnectionError = exports2.ConnectionErrors = exports2.LogTraceNotification = exports2.SetTraceNotification = exports2.TraceFormat = exports2.TraceValues = exports2.Trace = exports2.NullLogger = exports2.ProgressType = exports2.ProgressToken = void 0;
    var ral_1 = require_ral();
    var Is = require_is2();
    var messages_1 = require_messages();
    var linkedMap_1 = require_linkedMap();
    var events_1 = require_events();
    var cancellation_1 = require_cancellation();
    var CancelNotification;
    (function(CancelNotification2) {
      CancelNotification2.type = new messages_1.NotificationType("$/cancelRequest");
    })(CancelNotification || (CancelNotification = {}));
    var ProgressToken;
    (function(ProgressToken2) {
      function is(value) {
        return typeof value === "string" || typeof value === "number";
      }
      ProgressToken2.is = is;
    })(ProgressToken || (exports2.ProgressToken = ProgressToken = {}));
    var ProgressNotification;
    (function(ProgressNotification2) {
      ProgressNotification2.type = new messages_1.NotificationType("$/progress");
    })(ProgressNotification || (ProgressNotification = {}));
    var ProgressType = class {
      constructor() {
      }
    };
    exports2.ProgressType = ProgressType;
    var StarRequestHandler;
    (function(StarRequestHandler2) {
      function is(value) {
        return Is.func(value);
      }
      StarRequestHandler2.is = is;
    })(StarRequestHandler || (StarRequestHandler = {}));
    exports2.NullLogger = Object.freeze({
      error: () => {
      },
      warn: () => {
      },
      info: () => {
      },
      log: () => {
      }
    });
    var Trace;
    (function(Trace2) {
      Trace2[Trace2["Off"] = 0] = "Off";
      Trace2[Trace2["Messages"] = 1] = "Messages";
      Trace2[Trace2["Compact"] = 2] = "Compact";
      Trace2[Trace2["Verbose"] = 3] = "Verbose";
    })(Trace || (exports2.Trace = Trace = {}));
    var TraceValues;
    (function(TraceValues2) {
      TraceValues2.Off = "off";
      TraceValues2.Messages = "messages";
      TraceValues2.Compact = "compact";
      TraceValues2.Verbose = "verbose";
    })(TraceValues || (exports2.TraceValues = TraceValues = {}));
    (function(Trace2) {
      function fromString(value) {
        if (!Is.string(value)) {
          return Trace2.Off;
        }
        value = value.toLowerCase();
        switch (value) {
          case "off":
            return Trace2.Off;
          case "messages":
            return Trace2.Messages;
          case "compact":
            return Trace2.Compact;
          case "verbose":
            return Trace2.Verbose;
          default:
            return Trace2.Off;
        }
      }
      Trace2.fromString = fromString;
      function toString(value) {
        switch (value) {
          case Trace2.Off:
            return "off";
          case Trace2.Messages:
            return "messages";
          case Trace2.Compact:
            return "compact";
          case Trace2.Verbose:
            return "verbose";
          default:
            return "off";
        }
      }
      Trace2.toString = toString;
    })(Trace || (exports2.Trace = Trace = {}));
    var TraceFormat;
    (function(TraceFormat2) {
      TraceFormat2["Text"] = "text";
      TraceFormat2["JSON"] = "json";
    })(TraceFormat || (exports2.TraceFormat = TraceFormat = {}));
    (function(TraceFormat2) {
      function fromString(value) {
        if (!Is.string(value)) {
          return TraceFormat2.Text;
        }
        value = value.toLowerCase();
        if (value === "json") {
          return TraceFormat2.JSON;
        } else {
          return TraceFormat2.Text;
        }
      }
      TraceFormat2.fromString = fromString;
    })(TraceFormat || (exports2.TraceFormat = TraceFormat = {}));
    var SetTraceNotification;
    (function(SetTraceNotification2) {
      SetTraceNotification2.type = new messages_1.NotificationType("$/setTrace");
    })(SetTraceNotification || (exports2.SetTraceNotification = SetTraceNotification = {}));
    var LogTraceNotification;
    (function(LogTraceNotification2) {
      LogTraceNotification2.type = new messages_1.NotificationType("$/logTrace");
    })(LogTraceNotification || (exports2.LogTraceNotification = LogTraceNotification = {}));
    var ConnectionErrors;
    (function(ConnectionErrors2) {
      ConnectionErrors2[ConnectionErrors2["Closed"] = 1] = "Closed";
      ConnectionErrors2[ConnectionErrors2["Disposed"] = 2] = "Disposed";
      ConnectionErrors2[ConnectionErrors2["AlreadyListening"] = 3] = "AlreadyListening";
    })(ConnectionErrors || (exports2.ConnectionErrors = ConnectionErrors = {}));
    var ConnectionError = class _ConnectionError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
        Object.setPrototypeOf(this, _ConnectionError.prototype);
      }
    };
    exports2.ConnectionError = ConnectionError;
    var ConnectionStrategy;
    (function(ConnectionStrategy2) {
      function is(value) {
        const candidate = value;
        return candidate && Is.func(candidate.cancelUndispatched);
      }
      ConnectionStrategy2.is = is;
    })(ConnectionStrategy || (exports2.ConnectionStrategy = ConnectionStrategy = {}));
    var IdCancellationReceiverStrategy;
    (function(IdCancellationReceiverStrategy2) {
      function is(value) {
        const candidate = value;
        return candidate && (candidate.kind === void 0 || candidate.kind === "id") && Is.func(candidate.createCancellationTokenSource) && (candidate.dispose === void 0 || Is.func(candidate.dispose));
      }
      IdCancellationReceiverStrategy2.is = is;
    })(IdCancellationReceiverStrategy || (exports2.IdCancellationReceiverStrategy = IdCancellationReceiverStrategy = {}));
    var RequestCancellationReceiverStrategy;
    (function(RequestCancellationReceiverStrategy2) {
      function is(value) {
        const candidate = value;
        return candidate && candidate.kind === "request" && Is.func(candidate.createCancellationTokenSource) && (candidate.dispose === void 0 || Is.func(candidate.dispose));
      }
      RequestCancellationReceiverStrategy2.is = is;
    })(RequestCancellationReceiverStrategy || (exports2.RequestCancellationReceiverStrategy = RequestCancellationReceiverStrategy = {}));
    var CancellationReceiverStrategy;
    (function(CancellationReceiverStrategy2) {
      CancellationReceiverStrategy2.Message = Object.freeze({
        createCancellationTokenSource(_) {
          return new cancellation_1.CancellationTokenSource();
        }
      });
      function is(value) {
        return IdCancellationReceiverStrategy.is(value) || RequestCancellationReceiverStrategy.is(value);
      }
      CancellationReceiverStrategy2.is = is;
    })(CancellationReceiverStrategy || (exports2.CancellationReceiverStrategy = CancellationReceiverStrategy = {}));
    var CancellationSenderStrategy;
    (function(CancellationSenderStrategy2) {
      CancellationSenderStrategy2.Message = Object.freeze({
        sendCancellation(conn, id) {
          return conn.sendNotification(CancelNotification.type, { id });
        },
        cleanup(_) {
        }
      });
      function is(value) {
        const candidate = value;
        return candidate && Is.func(candidate.sendCancellation) && Is.func(candidate.cleanup);
      }
      CancellationSenderStrategy2.is = is;
    })(CancellationSenderStrategy || (exports2.CancellationSenderStrategy = CancellationSenderStrategy = {}));
    var CancellationStrategy;
    (function(CancellationStrategy2) {
      CancellationStrategy2.Message = Object.freeze({
        receiver: CancellationReceiverStrategy.Message,
        sender: CancellationSenderStrategy.Message
      });
      function is(value) {
        const candidate = value;
        return candidate && CancellationReceiverStrategy.is(candidate.receiver) && CancellationSenderStrategy.is(candidate.sender);
      }
      CancellationStrategy2.is = is;
    })(CancellationStrategy || (exports2.CancellationStrategy = CancellationStrategy = {}));
    var MessageStrategy;
    (function(MessageStrategy2) {
      function is(value) {
        const candidate = value;
        return candidate && Is.func(candidate.handleMessage);
      }
      MessageStrategy2.is = is;
    })(MessageStrategy || (exports2.MessageStrategy = MessageStrategy = {}));
    var ConnectionOptions;
    (function(ConnectionOptions2) {
      function is(value) {
        const candidate = value;
        return candidate && (CancellationStrategy.is(candidate.cancellationStrategy) || ConnectionStrategy.is(candidate.connectionStrategy) || MessageStrategy.is(candidate.messageStrategy));
      }
      ConnectionOptions2.is = is;
    })(ConnectionOptions || (exports2.ConnectionOptions = ConnectionOptions = {}));
    var ConnectionState;
    (function(ConnectionState2) {
      ConnectionState2[ConnectionState2["New"] = 1] = "New";
      ConnectionState2[ConnectionState2["Listening"] = 2] = "Listening";
      ConnectionState2[ConnectionState2["Closed"] = 3] = "Closed";
      ConnectionState2[ConnectionState2["Disposed"] = 4] = "Disposed";
    })(ConnectionState || (ConnectionState = {}));
    function createMessageConnection(messageReader, messageWriter, _logger, options) {
      const logger = _logger !== void 0 ? _logger : exports2.NullLogger;
      let sequenceNumber = 0;
      let notificationSequenceNumber = 0;
      let unknownResponseSequenceNumber = 0;
      const version = "2.0";
      let starRequestHandler = void 0;
      const requestHandlers = /* @__PURE__ */ new Map();
      let starNotificationHandler = void 0;
      const notificationHandlers = /* @__PURE__ */ new Map();
      const progressHandlers = /* @__PURE__ */ new Map();
      let timer;
      let messageQueue = new linkedMap_1.LinkedMap();
      let responsePromises = /* @__PURE__ */ new Map();
      let knownCanceledRequests = /* @__PURE__ */ new Set();
      let requestTokens = /* @__PURE__ */ new Map();
      let trace = Trace.Off;
      let traceFormat = TraceFormat.Text;
      let tracer;
      let state = ConnectionState.New;
      const errorEmitter = new events_1.Emitter();
      const closeEmitter = new events_1.Emitter();
      const unhandledNotificationEmitter = new events_1.Emitter();
      const unhandledProgressEmitter = new events_1.Emitter();
      const disposeEmitter = new events_1.Emitter();
      const cancellationStrategy = options && options.cancellationStrategy ? options.cancellationStrategy : CancellationStrategy.Message;
      function createRequestQueueKey(id) {
        if (id === null) {
          throw new Error(`Can't send requests with id null since the response can't be correlated.`);
        }
        return "req-" + id.toString();
      }
      function createResponseQueueKey(id) {
        if (id === null) {
          return "res-unknown-" + (++unknownResponseSequenceNumber).toString();
        } else {
          return "res-" + id.toString();
        }
      }
      function createNotificationQueueKey() {
        return "not-" + (++notificationSequenceNumber).toString();
      }
      function addMessageToQueue(queue, message) {
        if (messages_1.Message.isRequest(message)) {
          queue.set(createRequestQueueKey(message.id), message);
        } else if (messages_1.Message.isResponse(message)) {
          queue.set(createResponseQueueKey(message.id), message);
        } else {
          queue.set(createNotificationQueueKey(), message);
        }
      }
      function cancelUndispatched(_message) {
        return void 0;
      }
      function isListening() {
        return state === ConnectionState.Listening;
      }
      function isClosed() {
        return state === ConnectionState.Closed;
      }
      function isDisposed() {
        return state === ConnectionState.Disposed;
      }
      function closeHandler() {
        if (state === ConnectionState.New || state === ConnectionState.Listening) {
          state = ConnectionState.Closed;
          closeEmitter.fire(void 0);
        }
      }
      function readErrorHandler(error) {
        errorEmitter.fire([error, void 0, void 0]);
      }
      function writeErrorHandler(data) {
        errorEmitter.fire(data);
      }
      messageReader.onClose(closeHandler);
      messageReader.onError(readErrorHandler);
      messageWriter.onClose(closeHandler);
      messageWriter.onError(writeErrorHandler);
      function triggerMessageQueue() {
        if (timer || messageQueue.size === 0) {
          return;
        }
        timer = (0, ral_1.default)().timer.setImmediate(() => {
          timer = void 0;
          processMessageQueue();
        });
      }
      function handleMessage(message) {
        if (messages_1.Message.isRequest(message)) {
          handleRequest(message);
        } else if (messages_1.Message.isNotification(message)) {
          handleNotification(message);
        } else if (messages_1.Message.isResponse(message)) {
          handleResponse(message);
        } else {
          handleInvalidMessage(message);
        }
      }
      function processMessageQueue() {
        if (messageQueue.size === 0) {
          return;
        }
        const message = messageQueue.shift();
        try {
          const messageStrategy = options?.messageStrategy;
          if (MessageStrategy.is(messageStrategy)) {
            messageStrategy.handleMessage(message, handleMessage);
          } else {
            handleMessage(message);
          }
        } finally {
          triggerMessageQueue();
        }
      }
      const callback = (message) => {
        try {
          if (messages_1.Message.isNotification(message) && message.method === CancelNotification.type.method) {
            const cancelId = message.params.id;
            const key = createRequestQueueKey(cancelId);
            const toCancel = messageQueue.get(key);
            if (messages_1.Message.isRequest(toCancel)) {
              const strategy = options?.connectionStrategy;
              const response = strategy && strategy.cancelUndispatched ? strategy.cancelUndispatched(toCancel, cancelUndispatched) : cancelUndispatched(toCancel);
              if (response && (response.error !== void 0 || response.result !== void 0)) {
                messageQueue.delete(key);
                requestTokens.delete(cancelId);
                response.id = toCancel.id;
                traceSendingResponse(response, message.method, Date.now());
                messageWriter.write(response).catch(() => logger.error(`Sending response for canceled message failed.`));
                return;
              }
            }
            const cancellationToken = requestTokens.get(cancelId);
            if (cancellationToken !== void 0) {
              cancellationToken.cancel();
              traceReceivedNotification(message);
              return;
            } else {
              knownCanceledRequests.add(cancelId);
            }
          }
          addMessageToQueue(messageQueue, message);
        } finally {
          triggerMessageQueue();
        }
      };
      function handleRequest(requestMessage) {
        if (isDisposed()) {
          return;
        }
        function reply(resultOrError, method, startTime2) {
          const message = {
            jsonrpc: version,
            id: requestMessage.id
          };
          if (resultOrError instanceof messages_1.ResponseError) {
            message.error = resultOrError.toJson();
          } else {
            message.result = resultOrError === void 0 ? null : resultOrError;
          }
          traceSendingResponse(message, method, startTime2);
          messageWriter.write(message).catch(() => logger.error(`Sending response failed.`));
        }
        function replyError(error, method, startTime2) {
          const message = {
            jsonrpc: version,
            id: requestMessage.id,
            error: error.toJson()
          };
          traceSendingResponse(message, method, startTime2);
          messageWriter.write(message).catch(() => logger.error(`Sending response failed.`));
        }
        function replySuccess(result, method, startTime2) {
          if (result === void 0) {
            result = null;
          }
          const message = {
            jsonrpc: version,
            id: requestMessage.id,
            result
          };
          traceSendingResponse(message, method, startTime2);
          messageWriter.write(message).catch(() => logger.error(`Sending response failed.`));
        }
        traceReceivedRequest(requestMessage);
        const element = requestHandlers.get(requestMessage.method);
        let type;
        let requestHandler;
        if (element) {
          type = element.type;
          requestHandler = element.handler;
        }
        const startTime = Date.now();
        if (requestHandler || starRequestHandler) {
          const tokenKey = requestMessage.id ?? String(Date.now());
          const cancellationSource = IdCancellationReceiverStrategy.is(cancellationStrategy.receiver) ? cancellationStrategy.receiver.createCancellationTokenSource(tokenKey) : cancellationStrategy.receiver.createCancellationTokenSource(requestMessage);
          if (requestMessage.id !== null && knownCanceledRequests.has(requestMessage.id)) {
            cancellationSource.cancel();
          }
          if (requestMessage.id !== null) {
            requestTokens.set(tokenKey, cancellationSource);
          }
          try {
            let handlerResult;
            if (requestHandler) {
              if (requestMessage.params === void 0) {
                if (type !== void 0 && type.numberOfParams !== 0) {
                  replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InvalidParams, `Request ${requestMessage.method} defines ${type.numberOfParams} params but received none.`), requestMessage.method, startTime);
                  return;
                }
                handlerResult = requestHandler(cancellationSource.token);
              } else if (Array.isArray(requestMessage.params)) {
                if (type !== void 0 && type.parameterStructures === messages_1.ParameterStructures.byName) {
                  replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InvalidParams, `Request ${requestMessage.method} defines parameters by name but received parameters by position`), requestMessage.method, startTime);
                  return;
                }
                handlerResult = requestHandler(...requestMessage.params, cancellationSource.token);
              } else {
                if (type !== void 0 && type.parameterStructures === messages_1.ParameterStructures.byPosition) {
                  replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InvalidParams, `Request ${requestMessage.method} defines parameters by position but received parameters by name`), requestMessage.method, startTime);
                  return;
                }
                handlerResult = requestHandler(requestMessage.params, cancellationSource.token);
              }
            } else if (starRequestHandler) {
              handlerResult = starRequestHandler(requestMessage.method, requestMessage.params, cancellationSource.token);
            }
            const promise = handlerResult;
            if (!handlerResult) {
              requestTokens.delete(tokenKey);
              replySuccess(handlerResult, requestMessage.method, startTime);
            } else if (promise.then) {
              promise.then((resultOrError) => {
                requestTokens.delete(tokenKey);
                reply(resultOrError, requestMessage.method, startTime);
              }, (error) => {
                requestTokens.delete(tokenKey);
                if (error instanceof messages_1.ResponseError) {
                  replyError(error, requestMessage.method, startTime);
                } else if (error && Is.string(error.message)) {
                  replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InternalError, `Request ${requestMessage.method} failed with message: ${error.message}`), requestMessage.method, startTime);
                } else {
                  replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InternalError, `Request ${requestMessage.method} failed unexpectedly without providing any details.`), requestMessage.method, startTime);
                }
              });
            } else {
              requestTokens.delete(tokenKey);
              reply(handlerResult, requestMessage.method, startTime);
            }
          } catch (error) {
            requestTokens.delete(tokenKey);
            if (error instanceof messages_1.ResponseError) {
              reply(error, requestMessage.method, startTime);
            } else if (error && Is.string(error.message)) {
              replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InternalError, `Request ${requestMessage.method} failed with message: ${error.message}`), requestMessage.method, startTime);
            } else {
              replyError(new messages_1.ResponseError(messages_1.ErrorCodes.InternalError, `Request ${requestMessage.method} failed unexpectedly without providing any details.`), requestMessage.method, startTime);
            }
          }
        } else {
          replyError(new messages_1.ResponseError(messages_1.ErrorCodes.MethodNotFound, `Unhandled method ${requestMessage.method}`), requestMessage.method, startTime);
        }
      }
      function handleResponse(responseMessage) {
        if (isDisposed()) {
          return;
        }
        if (responseMessage.id === null) {
          if (responseMessage.error) {
            logger.error(`Received response message without id: Error is: 
${JSON.stringify(responseMessage.error, void 0, 4)}`);
          } else {
            logger.error(`Received response message without id. No further error information provided.`);
          }
        } else {
          const key = responseMessage.id;
          const responsePromise = responsePromises.get(key);
          traceReceivedResponse(responseMessage, responsePromise);
          if (responsePromise !== void 0) {
            responsePromises.delete(key);
            try {
              if (responseMessage.error) {
                const error = responseMessage.error;
                responsePromise.reject(new messages_1.ResponseError(error.code, error.message, error.data));
              } else if (responseMessage.result !== void 0) {
                responsePromise.resolve(responseMessage.result);
              } else {
                throw new Error("Should never happen.");
              }
            } catch (error) {
              if (error.message) {
                logger.error(`Response handler '${responsePromise.method}' failed with message: ${error.message}`);
              } else {
                logger.error(`Response handler '${responsePromise.method}' failed unexpectedly.`);
              }
            }
          }
        }
      }
      function handleNotification(message) {
        if (isDisposed()) {
          return;
        }
        let type = void 0;
        let notificationHandler;
        if (message.method === CancelNotification.type.method) {
          const cancelId = message.params.id;
          knownCanceledRequests.delete(cancelId);
          traceReceivedNotification(message);
          return;
        } else {
          const element = notificationHandlers.get(message.method);
          if (element) {
            notificationHandler = element.handler;
            type = element.type;
          }
        }
        if (notificationHandler || starNotificationHandler) {
          try {
            traceReceivedNotification(message);
            if (notificationHandler) {
              if (message.params === void 0) {
                if (type !== void 0) {
                  if (type.numberOfParams !== 0 && type.parameterStructures !== messages_1.ParameterStructures.byName) {
                    logger.error(`Notification ${message.method} defines ${type.numberOfParams} params but received none.`);
                  }
                }
                notificationHandler();
              } else if (Array.isArray(message.params)) {
                const params = message.params;
                if (message.method === ProgressNotification.type.method && params.length === 2 && ProgressToken.is(params[0])) {
                  notificationHandler({ token: params[0], value: params[1] });
                } else {
                  if (type !== void 0) {
                    if (type.parameterStructures === messages_1.ParameterStructures.byName) {
                      logger.error(`Notification ${message.method} defines parameters by name but received parameters by position`);
                    }
                    if (type.numberOfParams !== message.params.length) {
                      logger.error(`Notification ${message.method} defines ${type.numberOfParams} params but received ${params.length} arguments`);
                    }
                  }
                  notificationHandler(...params);
                }
              } else {
                if (type !== void 0 && type.parameterStructures === messages_1.ParameterStructures.byPosition) {
                  logger.error(`Notification ${message.method} defines parameters by position but received parameters by name`);
                }
                notificationHandler(message.params);
              }
            } else if (starNotificationHandler) {
              starNotificationHandler(message.method, message.params);
            }
          } catch (error) {
            if (error.message) {
              logger.error(`Notification handler '${message.method}' failed with message: ${error.message}`);
            } else {
              logger.error(`Notification handler '${message.method}' failed unexpectedly.`);
            }
          }
        } else {
          unhandledNotificationEmitter.fire(message);
        }
      }
      function handleInvalidMessage(message) {
        if (!message) {
          logger.error("Received empty message.");
          return;
        }
        logger.error(`Received message which is neither a response nor a notification message:
${JSON.stringify(message, null, 4)}`);
        const responseMessage = message;
        if (Is.string(responseMessage.id) || Is.number(responseMessage.id)) {
          const key = responseMessage.id;
          const responseHandler = responsePromises.get(key);
          if (responseHandler) {
            responseHandler.reject(new Error("The received response has neither a result nor an error property."));
          }
        }
      }
      function stringifyTrace(params) {
        if (params === void 0 || params === null) {
          return void 0;
        }
        switch (trace) {
          case Trace.Verbose:
            return JSON.stringify(params, null, 4);
          case Trace.Compact:
            return JSON.stringify(params);
          default:
            return void 0;
        }
      }
      function traceSendingRequest(message) {
        if (trace === Trace.Off || !tracer) {
          return;
        }
        if (traceFormat === TraceFormat.Text) {
          let data = void 0;
          if ((trace === Trace.Verbose || trace === Trace.Compact) && message.params) {
            data = `Params: ${stringifyTrace(message.params)}

`;
          }
          tracer.log(`Sending request '${message.method} - (${message.id})'.`, data);
        } else {
          logLSPMessage("send-request", message);
        }
      }
      function traceSendingNotification(message) {
        if (trace === Trace.Off || !tracer) {
          return;
        }
        if (traceFormat === TraceFormat.Text) {
          let data = void 0;
          if (trace === Trace.Verbose || trace === Trace.Compact) {
            if (message.params) {
              data = `Params: ${stringifyTrace(message.params)}

`;
            } else {
              data = "No parameters provided.\n\n";
            }
          }
          tracer.log(`Sending notification '${message.method}'.`, data);
        } else {
          logLSPMessage("send-notification", message);
        }
      }
      function traceSendingResponse(message, method, startTime) {
        if (trace === Trace.Off || !tracer) {
          return;
        }
        if (traceFormat === TraceFormat.Text) {
          let data = void 0;
          if (trace === Trace.Verbose || trace === Trace.Compact) {
            if (message.error && message.error.data) {
              data = `Error data: ${stringifyTrace(message.error.data)}

`;
            } else {
              if (message.result) {
                data = `Result: ${stringifyTrace(message.result)}

`;
              } else if (message.error === void 0) {
                data = "No result returned.\n\n";
              }
            }
          }
          tracer.log(`Sending response '${method} - (${message.id})'. Processing request took ${Date.now() - startTime}ms`, data);
        } else {
          logLSPMessage("send-response", message);
        }
      }
      function traceReceivedRequest(message) {
        if (trace === Trace.Off || !tracer) {
          return;
        }
        if (traceFormat === TraceFormat.Text) {
          let data = void 0;
          if ((trace === Trace.Verbose || trace === Trace.Compact) && message.params) {
            data = `Params: ${stringifyTrace(message.params)}

`;
          }
          tracer.log(`Received request '${message.method} - (${message.id})'.`, data);
        } else {
          logLSPMessage("receive-request", message);
        }
      }
      function traceReceivedNotification(message) {
        if (trace === Trace.Off || !tracer || message.method === LogTraceNotification.type.method) {
          return;
        }
        if (traceFormat === TraceFormat.Text) {
          let data = void 0;
          if (trace === Trace.Verbose || trace === Trace.Compact) {
            if (message.params) {
              data = `Params: ${stringifyTrace(message.params)}

`;
            } else {
              data = "No parameters provided.\n\n";
            }
          }
          tracer.log(`Received notification '${message.method}'.`, data);
        } else {
          logLSPMessage("receive-notification", message);
        }
      }
      function traceReceivedResponse(message, responsePromise) {
        if (trace === Trace.Off || !tracer) {
          return;
        }
        if (traceFormat === TraceFormat.Text) {
          let data = void 0;
          if (trace === Trace.Verbose || trace === Trace.Compact) {
            if (message.error && message.error.data) {
              data = `Error data: ${stringifyTrace(message.error.data)}

`;
            } else {
              if (message.result) {
                data = `Result: ${stringifyTrace(message.result)}

`;
              } else if (message.error === void 0) {
                data = "No result returned.\n\n";
              }
            }
          }
          if (responsePromise) {
            const error = message.error ? ` Request failed: ${message.error.message} (${message.error.code}).` : "";
            tracer.log(`Received response '${responsePromise.method} - (${message.id})' in ${Date.now() - responsePromise.timerStart}ms.${error}`, data);
          } else {
            tracer.log(`Received response ${message.id} without active response promise.`, data);
          }
        } else {
          logLSPMessage("receive-response", message);
        }
      }
      function logLSPMessage(type, message) {
        if (!tracer || trace === Trace.Off) {
          return;
        }
        const lspMessage = {
          isLSPMessage: true,
          type,
          message,
          timestamp: Date.now()
        };
        tracer.log(lspMessage);
      }
      function throwIfClosedOrDisposed() {
        if (isClosed()) {
          throw new ConnectionError(ConnectionErrors.Closed, "Connection is closed.");
        }
        if (isDisposed()) {
          throw new ConnectionError(ConnectionErrors.Disposed, "Connection is disposed.");
        }
      }
      function throwIfListening() {
        if (isListening()) {
          throw new ConnectionError(ConnectionErrors.AlreadyListening, "Connection is already listening");
        }
      }
      function throwIfNotListening() {
        if (!isListening()) {
          throw new Error("Call listen() first.");
        }
      }
      function undefinedToNull(param) {
        if (param === void 0) {
          return null;
        } else {
          return param;
        }
      }
      function nullToUndefined(param) {
        if (param === null) {
          return void 0;
        } else {
          return param;
        }
      }
      function isNamedParam(param) {
        return param !== void 0 && param !== null && !Array.isArray(param) && typeof param === "object";
      }
      function computeSingleParam(parameterStructures, param) {
        switch (parameterStructures) {
          case messages_1.ParameterStructures.auto:
            if (isNamedParam(param)) {
              return nullToUndefined(param);
            } else {
              return [undefinedToNull(param)];
            }
          case messages_1.ParameterStructures.byName:
            if (!isNamedParam(param)) {
              throw new Error(`Received parameters by name but param is not an object literal.`);
            }
            return nullToUndefined(param);
          case messages_1.ParameterStructures.byPosition:
            return [undefinedToNull(param)];
          default:
            throw new Error(`Unknown parameter structure ${parameterStructures.toString()}`);
        }
      }
      function computeMessageParams(type, params) {
        let result;
        const numberOfParams = type.numberOfParams;
        switch (numberOfParams) {
          case 0:
            result = void 0;
            break;
          case 1:
            result = computeSingleParam(type.parameterStructures, params[0]);
            break;
          default:
            result = [];
            for (let i = 0; i < params.length && i < numberOfParams; i++) {
              result.push(undefinedToNull(params[i]));
            }
            if (params.length < numberOfParams) {
              for (let i = params.length; i < numberOfParams; i++) {
                result.push(null);
              }
            }
            break;
        }
        return result;
      }
      const connection2 = {
        sendNotification: (type, ...args) => {
          throwIfClosedOrDisposed();
          let method;
          let messageParams;
          if (Is.string(type)) {
            method = type;
            const first = args[0];
            let paramStart = 0;
            let parameterStructures = messages_1.ParameterStructures.auto;
            if (messages_1.ParameterStructures.is(first)) {
              paramStart = 1;
              parameterStructures = first;
            }
            let paramEnd = args.length;
            const numberOfParams = paramEnd - paramStart;
            switch (numberOfParams) {
              case 0:
                messageParams = void 0;
                break;
              case 1:
                messageParams = computeSingleParam(parameterStructures, args[paramStart]);
                break;
              default:
                if (parameterStructures === messages_1.ParameterStructures.byName) {
                  throw new Error(`Received ${numberOfParams} parameters for 'by Name' notification parameter structure.`);
                }
                messageParams = args.slice(paramStart, paramEnd).map((value) => undefinedToNull(value));
                break;
            }
          } else {
            const params = args;
            method = type.method;
            messageParams = computeMessageParams(type, params);
          }
          const notificationMessage = {
            jsonrpc: version,
            method,
            params: messageParams
          };
          traceSendingNotification(notificationMessage);
          return messageWriter.write(notificationMessage).catch((error) => {
            logger.error(`Sending notification failed.`);
            throw error;
          });
        },
        onNotification: (type, handler) => {
          throwIfClosedOrDisposed();
          let method;
          if (Is.func(type)) {
            starNotificationHandler = type;
          } else if (handler) {
            if (Is.string(type)) {
              method = type;
              notificationHandlers.set(type, { type: void 0, handler });
            } else {
              method = type.method;
              notificationHandlers.set(type.method, { type, handler });
            }
          }
          return {
            dispose: () => {
              if (method !== void 0) {
                notificationHandlers.delete(method);
              } else {
                starNotificationHandler = void 0;
              }
            }
          };
        },
        onProgress: (_type, token, handler) => {
          if (progressHandlers.has(token)) {
            throw new Error(`Progress handler for token ${token} already registered`);
          }
          progressHandlers.set(token, handler);
          return {
            dispose: () => {
              progressHandlers.delete(token);
            }
          };
        },
        sendProgress: (_type, token, value) => {
          return connection2.sendNotification(ProgressNotification.type, { token, value });
        },
        onUnhandledProgress: unhandledProgressEmitter.event,
        sendRequest: (type, ...args) => {
          throwIfClosedOrDisposed();
          throwIfNotListening();
          let method;
          let messageParams;
          let token = void 0;
          if (Is.string(type)) {
            method = type;
            const first = args[0];
            const last = args[args.length - 1];
            let paramStart = 0;
            let parameterStructures = messages_1.ParameterStructures.auto;
            if (messages_1.ParameterStructures.is(first)) {
              paramStart = 1;
              parameterStructures = first;
            }
            let paramEnd = args.length;
            if (cancellation_1.CancellationToken.is(last)) {
              paramEnd = paramEnd - 1;
              token = last;
            }
            const numberOfParams = paramEnd - paramStart;
            switch (numberOfParams) {
              case 0:
                messageParams = void 0;
                break;
              case 1:
                messageParams = computeSingleParam(parameterStructures, args[paramStart]);
                break;
              default:
                if (parameterStructures === messages_1.ParameterStructures.byName) {
                  throw new Error(`Received ${numberOfParams} parameters for 'by Name' request parameter structure.`);
                }
                messageParams = args.slice(paramStart, paramEnd).map((value) => undefinedToNull(value));
                break;
            }
          } else {
            const params = args;
            method = type.method;
            messageParams = computeMessageParams(type, params);
            const numberOfParams = type.numberOfParams;
            token = cancellation_1.CancellationToken.is(params[numberOfParams]) ? params[numberOfParams] : void 0;
          }
          const id = sequenceNumber++;
          let disposable;
          if (token) {
            disposable = token.onCancellationRequested(() => {
              const p = cancellationStrategy.sender.sendCancellation(connection2, id);
              if (p === void 0) {
                logger.log(`Received no promise from cancellation strategy when cancelling id ${id}`);
                return Promise.resolve();
              } else {
                return p.catch(() => {
                  logger.log(`Sending cancellation messages for id ${id} failed`);
                });
              }
            });
          }
          const requestMessage = {
            jsonrpc: version,
            id,
            method,
            params: messageParams
          };
          traceSendingRequest(requestMessage);
          if (typeof cancellationStrategy.sender.enableCancellation === "function") {
            cancellationStrategy.sender.enableCancellation(requestMessage);
          }
          return new Promise(async (resolve2, reject) => {
            const resolveWithCleanup = (r) => {
              resolve2(r);
              cancellationStrategy.sender.cleanup(id);
              disposable?.dispose();
            };
            const rejectWithCleanup = (r) => {
              reject(r);
              cancellationStrategy.sender.cleanup(id);
              disposable?.dispose();
            };
            const responsePromise = { method, timerStart: Date.now(), resolve: resolveWithCleanup, reject: rejectWithCleanup };
            try {
              await messageWriter.write(requestMessage);
              responsePromises.set(id, responsePromise);
            } catch (error) {
              logger.error(`Sending request failed.`);
              responsePromise.reject(new messages_1.ResponseError(messages_1.ErrorCodes.MessageWriteError, error.message ? error.message : "Unknown reason"));
              throw error;
            }
          });
        },
        onRequest: (type, handler) => {
          throwIfClosedOrDisposed();
          let method = null;
          if (StarRequestHandler.is(type)) {
            method = void 0;
            starRequestHandler = type;
          } else if (Is.string(type)) {
            method = null;
            if (handler !== void 0) {
              method = type;
              requestHandlers.set(type, { handler, type: void 0 });
            }
          } else {
            if (handler !== void 0) {
              method = type.method;
              requestHandlers.set(type.method, { type, handler });
            }
          }
          return {
            dispose: () => {
              if (method === null) {
                return;
              }
              if (method !== void 0) {
                requestHandlers.delete(method);
              } else {
                starRequestHandler = void 0;
              }
            }
          };
        },
        hasPendingResponse: () => {
          return responsePromises.size > 0;
        },
        trace: async (_value, _tracer, sendNotificationOrTraceOptions) => {
          let _sendNotification = false;
          let _traceFormat = TraceFormat.Text;
          if (sendNotificationOrTraceOptions !== void 0) {
            if (Is.boolean(sendNotificationOrTraceOptions)) {
              _sendNotification = sendNotificationOrTraceOptions;
            } else {
              _sendNotification = sendNotificationOrTraceOptions.sendNotification || false;
              _traceFormat = sendNotificationOrTraceOptions.traceFormat || TraceFormat.Text;
            }
          }
          trace = _value;
          traceFormat = _traceFormat;
          if (trace === Trace.Off) {
            tracer = void 0;
          } else {
            tracer = _tracer;
          }
          if (_sendNotification && !isClosed() && !isDisposed()) {
            await connection2.sendNotification(SetTraceNotification.type, { value: Trace.toString(_value) });
          }
        },
        onError: errorEmitter.event,
        onClose: closeEmitter.event,
        onUnhandledNotification: unhandledNotificationEmitter.event,
        onDispose: disposeEmitter.event,
        end: () => {
          messageWriter.end();
        },
        dispose: () => {
          if (isDisposed()) {
            return;
          }
          state = ConnectionState.Disposed;
          disposeEmitter.fire(void 0);
          const error = new messages_1.ResponseError(messages_1.ErrorCodes.PendingResponseRejected, "Pending response rejected since connection got disposed");
          for (const promise of responsePromises.values()) {
            promise.reject(error);
          }
          responsePromises = /* @__PURE__ */ new Map();
          requestTokens = /* @__PURE__ */ new Map();
          knownCanceledRequests = /* @__PURE__ */ new Set();
          messageQueue = new linkedMap_1.LinkedMap();
          if (Is.func(messageWriter.dispose)) {
            messageWriter.dispose();
          }
          if (Is.func(messageReader.dispose)) {
            messageReader.dispose();
          }
        },
        listen: () => {
          throwIfClosedOrDisposed();
          throwIfListening();
          state = ConnectionState.Listening;
          messageReader.listen(callback);
        },
        inspect: () => {
          (0, ral_1.default)().console.log("inspect");
        }
      };
      connection2.onNotification(LogTraceNotification.type, (params) => {
        if (trace === Trace.Off || !tracer) {
          return;
        }
        const verbose = trace === Trace.Verbose || trace === Trace.Compact;
        tracer.log(params.message, verbose ? params.verbose : void 0);
      });
      connection2.onNotification(ProgressNotification.type, (params) => {
        const handler = progressHandlers.get(params.token);
        if (handler) {
          handler(params.value);
        } else {
          unhandledProgressEmitter.fire(params);
        }
      });
      return connection2;
    }
    exports2.createMessageConnection = createMessageConnection;
  }
});

// ../../node_modules/vscode-jsonrpc/lib/common/api.js
var require_api = __commonJS({
  "../../node_modules/vscode-jsonrpc/lib/common/api.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ProgressType = exports2.ProgressToken = exports2.createMessageConnection = exports2.NullLogger = exports2.ConnectionOptions = exports2.ConnectionStrategy = exports2.AbstractMessageBuffer = exports2.WriteableStreamMessageWriter = exports2.AbstractMessageWriter = exports2.MessageWriter = exports2.ReadableStreamMessageReader = exports2.AbstractMessageReader = exports2.MessageReader = exports2.SharedArrayReceiverStrategy = exports2.SharedArraySenderStrategy = exports2.CancellationToken = exports2.CancellationTokenSource = exports2.Emitter = exports2.Event = exports2.Disposable = exports2.LRUCache = exports2.Touch = exports2.LinkedMap = exports2.ParameterStructures = exports2.NotificationType9 = exports2.NotificationType8 = exports2.NotificationType7 = exports2.NotificationType6 = exports2.NotificationType5 = exports2.NotificationType4 = exports2.NotificationType3 = exports2.NotificationType2 = exports2.NotificationType1 = exports2.NotificationType0 = exports2.NotificationType = exports2.ErrorCodes = exports2.ResponseError = exports2.RequestType9 = exports2.RequestType8 = exports2.RequestType7 = exports2.RequestType6 = exports2.RequestType5 = exports2.RequestType4 = exports2.RequestType3 = exports2.RequestType2 = exports2.RequestType1 = exports2.RequestType0 = exports2.RequestType = exports2.Message = exports2.RAL = void 0;
    exports2.MessageStrategy = exports2.CancellationStrategy = exports2.CancellationSenderStrategy = exports2.CancellationReceiverStrategy = exports2.ConnectionError = exports2.ConnectionErrors = exports2.LogTraceNotification = exports2.SetTraceNotification = exports2.TraceFormat = exports2.TraceValues = exports2.Trace = void 0;
    var messages_1 = require_messages();
    Object.defineProperty(exports2, "Message", { enumerable: true, get: function() {
      return messages_1.Message;
    } });
    Object.defineProperty(exports2, "RequestType", { enumerable: true, get: function() {
      return messages_1.RequestType;
    } });
    Object.defineProperty(exports2, "RequestType0", { enumerable: true, get: function() {
      return messages_1.RequestType0;
    } });
    Object.defineProperty(exports2, "RequestType1", { enumerable: true, get: function() {
      return messages_1.RequestType1;
    } });
    Object.defineProperty(exports2, "RequestType2", { enumerable: true, get: function() {
      return messages_1.RequestType2;
    } });
    Object.defineProperty(exports2, "RequestType3", { enumerable: true, get: function() {
      return messages_1.RequestType3;
    } });
    Object.defineProperty(exports2, "RequestType4", { enumerable: true, get: function() {
      return messages_1.RequestType4;
    } });
    Object.defineProperty(exports2, "RequestType5", { enumerable: true, get: function() {
      return messages_1.RequestType5;
    } });
    Object.defineProperty(exports2, "RequestType6", { enumerable: true, get: function() {
      return messages_1.RequestType6;
    } });
    Object.defineProperty(exports2, "RequestType7", { enumerable: true, get: function() {
      return messages_1.RequestType7;
    } });
    Object.defineProperty(exports2, "RequestType8", { enumerable: true, get: function() {
      return messages_1.RequestType8;
    } });
    Object.defineProperty(exports2, "RequestType9", { enumerable: true, get: function() {
      return messages_1.RequestType9;
    } });
    Object.defineProperty(exports2, "ResponseError", { enumerable: true, get: function() {
      return messages_1.ResponseError;
    } });
    Object.defineProperty(exports2, "ErrorCodes", { enumerable: true, get: function() {
      return messages_1.ErrorCodes;
    } });
    Object.defineProperty(exports2, "NotificationType", { enumerable: true, get: function() {
      return messages_1.NotificationType;
    } });
    Object.defineProperty(exports2, "NotificationType0", { enumerable: true, get: function() {
      return messages_1.NotificationType0;
    } });
    Object.defineProperty(exports2, "NotificationType1", { enumerable: true, get: function() {
      return messages_1.NotificationType1;
    } });
    Object.defineProperty(exports2, "NotificationType2", { enumerable: true, get: function() {
      return messages_1.NotificationType2;
    } });
    Object.defineProperty(exports2, "NotificationType3", { enumerable: true, get: function() {
      return messages_1.NotificationType3;
    } });
    Object.defineProperty(exports2, "NotificationType4", { enumerable: true, get: function() {
      return messages_1.NotificationType4;
    } });
    Object.defineProperty(exports2, "NotificationType5", { enumerable: true, get: function() {
      return messages_1.NotificationType5;
    } });
    Object.defineProperty(exports2, "NotificationType6", { enumerable: true, get: function() {
      return messages_1.NotificationType6;
    } });
    Object.defineProperty(exports2, "NotificationType7", { enumerable: true, get: function() {
      return messages_1.NotificationType7;
    } });
    Object.defineProperty(exports2, "NotificationType8", { enumerable: true, get: function() {
      return messages_1.NotificationType8;
    } });
    Object.defineProperty(exports2, "NotificationType9", { enumerable: true, get: function() {
      return messages_1.NotificationType9;
    } });
    Object.defineProperty(exports2, "ParameterStructures", { enumerable: true, get: function() {
      return messages_1.ParameterStructures;
    } });
    var linkedMap_1 = require_linkedMap();
    Object.defineProperty(exports2, "LinkedMap", { enumerable: true, get: function() {
      return linkedMap_1.LinkedMap;
    } });
    Object.defineProperty(exports2, "LRUCache", { enumerable: true, get: function() {
      return linkedMap_1.LRUCache;
    } });
    Object.defineProperty(exports2, "Touch", { enumerable: true, get: function() {
      return linkedMap_1.Touch;
    } });
    var disposable_1 = require_disposable();
    Object.defineProperty(exports2, "Disposable", { enumerable: true, get: function() {
      return disposable_1.Disposable;
    } });
    var events_1 = require_events();
    Object.defineProperty(exports2, "Event", { enumerable: true, get: function() {
      return events_1.Event;
    } });
    Object.defineProperty(exports2, "Emitter", { enumerable: true, get: function() {
      return events_1.Emitter;
    } });
    var cancellation_1 = require_cancellation();
    Object.defineProperty(exports2, "CancellationTokenSource", { enumerable: true, get: function() {
      return cancellation_1.CancellationTokenSource;
    } });
    Object.defineProperty(exports2, "CancellationToken", { enumerable: true, get: function() {
      return cancellation_1.CancellationToken;
    } });
    var sharedArrayCancellation_1 = require_sharedArrayCancellation();
    Object.defineProperty(exports2, "SharedArraySenderStrategy", { enumerable: true, get: function() {
      return sharedArrayCancellation_1.SharedArraySenderStrategy;
    } });
    Object.defineProperty(exports2, "SharedArrayReceiverStrategy", { enumerable: true, get: function() {
      return sharedArrayCancellation_1.SharedArrayReceiverStrategy;
    } });
    var messageReader_1 = require_messageReader();
    Object.defineProperty(exports2, "MessageReader", { enumerable: true, get: function() {
      return messageReader_1.MessageReader;
    } });
    Object.defineProperty(exports2, "AbstractMessageReader", { enumerable: true, get: function() {
      return messageReader_1.AbstractMessageReader;
    } });
    Object.defineProperty(exports2, "ReadableStreamMessageReader", { enumerable: true, get: function() {
      return messageReader_1.ReadableStreamMessageReader;
    } });
    var messageWriter_1 = require_messageWriter();
    Object.defineProperty(exports2, "MessageWriter", { enumerable: true, get: function() {
      return messageWriter_1.MessageWriter;
    } });
    Object.defineProperty(exports2, "AbstractMessageWriter", { enumerable: true, get: function() {
      return messageWriter_1.AbstractMessageWriter;
    } });
    Object.defineProperty(exports2, "WriteableStreamMessageWriter", { enumerable: true, get: function() {
      return messageWriter_1.WriteableStreamMessageWriter;
    } });
    var messageBuffer_1 = require_messageBuffer();
    Object.defineProperty(exports2, "AbstractMessageBuffer", { enumerable: true, get: function() {
      return messageBuffer_1.AbstractMessageBuffer;
    } });
    var connection_1 = require_connection();
    Object.defineProperty(exports2, "ConnectionStrategy", { enumerable: true, get: function() {
      return connection_1.ConnectionStrategy;
    } });
    Object.defineProperty(exports2, "ConnectionOptions", { enumerable: true, get: function() {
      return connection_1.ConnectionOptions;
    } });
    Object.defineProperty(exports2, "NullLogger", { enumerable: true, get: function() {
      return connection_1.NullLogger;
    } });
    Object.defineProperty(exports2, "createMessageConnection", { enumerable: true, get: function() {
      return connection_1.createMessageConnection;
    } });
    Object.defineProperty(exports2, "ProgressToken", { enumerable: true, get: function() {
      return connection_1.ProgressToken;
    } });
    Object.defineProperty(exports2, "ProgressType", { enumerable: true, get: function() {
      return connection_1.ProgressType;
    } });
    Object.defineProperty(exports2, "Trace", { enumerable: true, get: function() {
      return connection_1.Trace;
    } });
    Object.defineProperty(exports2, "TraceValues", { enumerable: true, get: function() {
      return connection_1.TraceValues;
    } });
    Object.defineProperty(exports2, "TraceFormat", { enumerable: true, get: function() {
      return connection_1.TraceFormat;
    } });
    Object.defineProperty(exports2, "SetTraceNotification", { enumerable: true, get: function() {
      return connection_1.SetTraceNotification;
    } });
    Object.defineProperty(exports2, "LogTraceNotification", { enumerable: true, get: function() {
      return connection_1.LogTraceNotification;
    } });
    Object.defineProperty(exports2, "ConnectionErrors", { enumerable: true, get: function() {
      return connection_1.ConnectionErrors;
    } });
    Object.defineProperty(exports2, "ConnectionError", { enumerable: true, get: function() {
      return connection_1.ConnectionError;
    } });
    Object.defineProperty(exports2, "CancellationReceiverStrategy", { enumerable: true, get: function() {
      return connection_1.CancellationReceiverStrategy;
    } });
    Object.defineProperty(exports2, "CancellationSenderStrategy", { enumerable: true, get: function() {
      return connection_1.CancellationSenderStrategy;
    } });
    Object.defineProperty(exports2, "CancellationStrategy", { enumerable: true, get: function() {
      return connection_1.CancellationStrategy;
    } });
    Object.defineProperty(exports2, "MessageStrategy", { enumerable: true, get: function() {
      return connection_1.MessageStrategy;
    } });
    var ral_1 = require_ral();
    exports2.RAL = ral_1.default;
  }
});

// ../../node_modules/vscode-jsonrpc/lib/node/ril.js
var require_ril = __commonJS({
  "../../node_modules/vscode-jsonrpc/lib/node/ril.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var util_1 = require("util");
    var api_1 = require_api();
    var MessageBuffer = class _MessageBuffer extends api_1.AbstractMessageBuffer {
      constructor(encoding = "utf-8") {
        super(encoding);
      }
      emptyBuffer() {
        return _MessageBuffer.emptyBuffer;
      }
      fromString(value, encoding) {
        return Buffer.from(value, encoding);
      }
      toString(value, encoding) {
        if (value instanceof Buffer) {
          return value.toString(encoding);
        } else {
          return new util_1.TextDecoder(encoding).decode(value);
        }
      }
      asNative(buffer, length) {
        if (length === void 0) {
          return buffer instanceof Buffer ? buffer : Buffer.from(buffer);
        } else {
          return buffer instanceof Buffer ? buffer.slice(0, length) : Buffer.from(buffer, 0, length);
        }
      }
      allocNative(length) {
        return Buffer.allocUnsafe(length);
      }
    };
    MessageBuffer.emptyBuffer = Buffer.allocUnsafe(0);
    var ReadableStreamWrapper = class {
      constructor(stream) {
        this.stream = stream;
      }
      onClose(listener) {
        this.stream.on("close", listener);
        return api_1.Disposable.create(() => this.stream.off("close", listener));
      }
      onError(listener) {
        this.stream.on("error", listener);
        return api_1.Disposable.create(() => this.stream.off("error", listener));
      }
      onEnd(listener) {
        this.stream.on("end", listener);
        return api_1.Disposable.create(() => this.stream.off("end", listener));
      }
      onData(listener) {
        this.stream.on("data", listener);
        return api_1.Disposable.create(() => this.stream.off("data", listener));
      }
    };
    var WritableStreamWrapper = class {
      constructor(stream) {
        this.stream = stream;
      }
      onClose(listener) {
        this.stream.on("close", listener);
        return api_1.Disposable.create(() => this.stream.off("close", listener));
      }
      onError(listener) {
        this.stream.on("error", listener);
        return api_1.Disposable.create(() => this.stream.off("error", listener));
      }
      onEnd(listener) {
        this.stream.on("end", listener);
        return api_1.Disposable.create(() => this.stream.off("end", listener));
      }
      write(data, encoding) {
        return new Promise((resolve2, reject) => {
          const callback = (error) => {
            if (error === void 0 || error === null) {
              resolve2();
            } else {
              reject(error);
            }
          };
          if (typeof data === "string") {
            this.stream.write(data, encoding, callback);
          } else {
            this.stream.write(data, callback);
          }
        });
      }
      end() {
        this.stream.end();
      }
    };
    var _ril = Object.freeze({
      messageBuffer: Object.freeze({
        create: (encoding) => new MessageBuffer(encoding)
      }),
      applicationJson: Object.freeze({
        encoder: Object.freeze({
          name: "application/json",
          encode: (msg, options) => {
            try {
              return Promise.resolve(Buffer.from(JSON.stringify(msg, void 0, 0), options.charset));
            } catch (err) {
              return Promise.reject(err);
            }
          }
        }),
        decoder: Object.freeze({
          name: "application/json",
          decode: (buffer, options) => {
            try {
              if (buffer instanceof Buffer) {
                return Promise.resolve(JSON.parse(buffer.toString(options.charset)));
              } else {
                return Promise.resolve(JSON.parse(new util_1.TextDecoder(options.charset).decode(buffer)));
              }
            } catch (err) {
              return Promise.reject(err);
            }
          }
        })
      }),
      stream: Object.freeze({
        asReadableStream: (stream) => new ReadableStreamWrapper(stream),
        asWritableStream: (stream) => new WritableStreamWrapper(stream)
      }),
      console,
      timer: Object.freeze({
        setTimeout(callback, ms, ...args) {
          const handle = setTimeout(callback, ms, ...args);
          return { dispose: () => clearTimeout(handle) };
        },
        setImmediate(callback, ...args) {
          const handle = setImmediate(callback, ...args);
          return { dispose: () => clearImmediate(handle) };
        },
        setInterval(callback, ms, ...args) {
          const handle = setInterval(callback, ms, ...args);
          return { dispose: () => clearInterval(handle) };
        }
      })
    });
    function RIL() {
      return _ril;
    }
    (function(RIL2) {
      function install() {
        api_1.RAL.install(_ril);
      }
      RIL2.install = install;
    })(RIL || (RIL = {}));
    exports2.default = RIL;
  }
});

// ../../node_modules/vscode-jsonrpc/lib/node/main.js
var require_main = __commonJS({
  "../../node_modules/vscode-jsonrpc/lib/node/main.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createMessageConnection = exports2.createServerSocketTransport = exports2.createClientSocketTransport = exports2.createServerPipeTransport = exports2.createClientPipeTransport = exports2.generateRandomPipeName = exports2.StreamMessageWriter = exports2.StreamMessageReader = exports2.SocketMessageWriter = exports2.SocketMessageReader = exports2.PortMessageWriter = exports2.PortMessageReader = exports2.IPCMessageWriter = exports2.IPCMessageReader = void 0;
    var ril_1 = require_ril();
    ril_1.default.install();
    var path2 = require("path");
    var os = require("os");
    var crypto_1 = require("crypto");
    var net_1 = require("net");
    var api_1 = require_api();
    __exportStar(require_api(), exports2);
    var IPCMessageReader = class extends api_1.AbstractMessageReader {
      constructor(process2) {
        super();
        this.process = process2;
        let eventEmitter = this.process;
        eventEmitter.on("error", (error) => this.fireError(error));
        eventEmitter.on("close", () => this.fireClose());
      }
      listen(callback) {
        this.process.on("message", callback);
        return api_1.Disposable.create(() => this.process.off("message", callback));
      }
    };
    exports2.IPCMessageReader = IPCMessageReader;
    var IPCMessageWriter = class extends api_1.AbstractMessageWriter {
      constructor(process2) {
        super();
        this.process = process2;
        this.errorCount = 0;
        const eventEmitter = this.process;
        eventEmitter.on("error", (error) => this.fireError(error));
        eventEmitter.on("close", () => this.fireClose);
      }
      write(msg) {
        try {
          if (typeof this.process.send === "function") {
            this.process.send(msg, void 0, void 0, (error) => {
              if (error) {
                this.errorCount++;
                this.handleError(error, msg);
              } else {
                this.errorCount = 0;
              }
            });
          }
          return Promise.resolve();
        } catch (error) {
          this.handleError(error, msg);
          return Promise.reject(error);
        }
      }
      handleError(error, msg) {
        this.errorCount++;
        this.fireError(error, msg, this.errorCount);
      }
      end() {
      }
    };
    exports2.IPCMessageWriter = IPCMessageWriter;
    var PortMessageReader = class extends api_1.AbstractMessageReader {
      constructor(port) {
        super();
        this.onData = new api_1.Emitter();
        port.on("close", () => this.fireClose);
        port.on("error", (error) => this.fireError(error));
        port.on("message", (message) => {
          this.onData.fire(message);
        });
      }
      listen(callback) {
        return this.onData.event(callback);
      }
    };
    exports2.PortMessageReader = PortMessageReader;
    var PortMessageWriter = class extends api_1.AbstractMessageWriter {
      constructor(port) {
        super();
        this.port = port;
        this.errorCount = 0;
        port.on("close", () => this.fireClose());
        port.on("error", (error) => this.fireError(error));
      }
      write(msg) {
        try {
          this.port.postMessage(msg);
          return Promise.resolve();
        } catch (error) {
          this.handleError(error, msg);
          return Promise.reject(error);
        }
      }
      handleError(error, msg) {
        this.errorCount++;
        this.fireError(error, msg, this.errorCount);
      }
      end() {
      }
    };
    exports2.PortMessageWriter = PortMessageWriter;
    var SocketMessageReader = class extends api_1.ReadableStreamMessageReader {
      constructor(socket, encoding = "utf-8") {
        super((0, ril_1.default)().stream.asReadableStream(socket), encoding);
      }
    };
    exports2.SocketMessageReader = SocketMessageReader;
    var SocketMessageWriter = class extends api_1.WriteableStreamMessageWriter {
      constructor(socket, options) {
        super((0, ril_1.default)().stream.asWritableStream(socket), options);
        this.socket = socket;
      }
      dispose() {
        super.dispose();
        this.socket.destroy();
      }
    };
    exports2.SocketMessageWriter = SocketMessageWriter;
    var StreamMessageReader = class extends api_1.ReadableStreamMessageReader {
      constructor(readable, encoding) {
        super((0, ril_1.default)().stream.asReadableStream(readable), encoding);
      }
    };
    exports2.StreamMessageReader = StreamMessageReader;
    var StreamMessageWriter = class extends api_1.WriteableStreamMessageWriter {
      constructor(writable, options) {
        super((0, ril_1.default)().stream.asWritableStream(writable), options);
      }
    };
    exports2.StreamMessageWriter = StreamMessageWriter;
    var XDG_RUNTIME_DIR = process.env["XDG_RUNTIME_DIR"];
    var safeIpcPathLengths = /* @__PURE__ */ new Map([
      ["linux", 107],
      ["darwin", 103]
    ]);
    function generateRandomPipeName() {
      const randomSuffix = (0, crypto_1.randomBytes)(21).toString("hex");
      if (process.platform === "win32") {
        return `\\\\.\\pipe\\vscode-jsonrpc-${randomSuffix}-sock`;
      }
      let result;
      if (XDG_RUNTIME_DIR) {
        result = path2.join(XDG_RUNTIME_DIR, `vscode-ipc-${randomSuffix}.sock`);
      } else {
        result = path2.join(os.tmpdir(), `vscode-${randomSuffix}.sock`);
      }
      const limit = safeIpcPathLengths.get(process.platform);
      if (limit !== void 0 && result.length > limit) {
        (0, ril_1.default)().console.warn(`WARNING: IPC handle "${result}" is longer than ${limit} characters.`);
      }
      return result;
    }
    exports2.generateRandomPipeName = generateRandomPipeName;
    function createClientPipeTransport(pipeName, encoding = "utf-8") {
      let connectResolve;
      const connected = new Promise((resolve2, _reject) => {
        connectResolve = resolve2;
      });
      return new Promise((resolve2, reject) => {
        let server = (0, net_1.createServer)((socket) => {
          server.close();
          connectResolve([
            new SocketMessageReader(socket, encoding),
            new SocketMessageWriter(socket, encoding)
          ]);
        });
        server.on("error", reject);
        server.listen(pipeName, () => {
          server.removeListener("error", reject);
          resolve2({
            onConnected: () => {
              return connected;
            }
          });
        });
      });
    }
    exports2.createClientPipeTransport = createClientPipeTransport;
    function createServerPipeTransport(pipeName, encoding = "utf-8") {
      const socket = (0, net_1.createConnection)(pipeName);
      return [
        new SocketMessageReader(socket, encoding),
        new SocketMessageWriter(socket, encoding)
      ];
    }
    exports2.createServerPipeTransport = createServerPipeTransport;
    function createClientSocketTransport(port, encoding = "utf-8") {
      let connectResolve;
      const connected = new Promise((resolve2, _reject) => {
        connectResolve = resolve2;
      });
      return new Promise((resolve2, reject) => {
        const server = (0, net_1.createServer)((socket) => {
          server.close();
          connectResolve([
            new SocketMessageReader(socket, encoding),
            new SocketMessageWriter(socket, encoding)
          ]);
        });
        server.on("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.removeListener("error", reject);
          resolve2({
            onConnected: () => {
              return connected;
            }
          });
        });
      });
    }
    exports2.createClientSocketTransport = createClientSocketTransport;
    function createServerSocketTransport(port, encoding = "utf-8") {
      const socket = (0, net_1.createConnection)(port, "127.0.0.1");
      return [
        new SocketMessageReader(socket, encoding),
        new SocketMessageWriter(socket, encoding)
      ];
    }
    exports2.createServerSocketTransport = createServerSocketTransport;
    function isReadableStream(value) {
      const candidate = value;
      return candidate.read !== void 0 && candidate.addListener !== void 0;
    }
    function isWritableStream(value) {
      const candidate = value;
      return candidate.write !== void 0 && candidate.addListener !== void 0;
    }
    function createMessageConnection(input, output, logger, options) {
      if (!logger) {
        logger = api_1.NullLogger;
      }
      const reader = isReadableStream(input) ? new StreamMessageReader(input) : input;
      const writer = isWritableStream(output) ? new StreamMessageWriter(output) : output;
      if (api_1.ConnectionStrategy.is(options)) {
        options = { connectionStrategy: options };
      }
      return (0, api_1.createMessageConnection)(reader, writer, logger, options);
    }
    exports2.createMessageConnection = createMessageConnection;
  }
});

// ../../node_modules/vscode-jsonrpc/node.js
var require_node = __commonJS({
  "../../node_modules/vscode-jsonrpc/node.js"(exports2, module2) {
    "use strict";
    module2.exports = require_main();
  }
});

// ../../node_modules/vscode-languageserver-types/lib/umd/main.js
var require_main2 = __commonJS({
  "../../node_modules/vscode-languageserver-types/lib/umd/main.js"(exports2, module2) {
    (function(factory) {
      if (typeof module2 === "object" && typeof module2.exports === "object") {
        var v = factory(require, exports2);
        if (v !== void 0) module2.exports = v;
      } else if (typeof define === "function" && define.amd) {
        define(["require", "exports"], factory);
      }
    })(function(require2, exports3) {
      "use strict";
      Object.defineProperty(exports3, "__esModule", { value: true });
      exports3.TextDocument = exports3.EOL = exports3.WorkspaceFolder = exports3.InlineCompletionContext = exports3.SelectedCompletionInfo = exports3.InlineCompletionTriggerKind = exports3.InlineCompletionList = exports3.InlineCompletionItem = exports3.StringValue = exports3.InlayHint = exports3.InlayHintLabelPart = exports3.InlayHintKind = exports3.InlineValueContext = exports3.InlineValueEvaluatableExpression = exports3.InlineValueVariableLookup = exports3.InlineValueText = exports3.SemanticTokens = exports3.SemanticTokenModifiers = exports3.SemanticTokenTypes = exports3.SelectionRange = exports3.DocumentLink = exports3.FormattingOptions = exports3.CodeLens = exports3.CodeAction = exports3.CodeActionContext = exports3.CodeActionTriggerKind = exports3.CodeActionKind = exports3.DocumentSymbol = exports3.WorkspaceSymbol = exports3.SymbolInformation = exports3.SymbolTag = exports3.SymbolKind = exports3.DocumentHighlight = exports3.DocumentHighlightKind = exports3.SignatureInformation = exports3.ParameterInformation = exports3.Hover = exports3.MarkedString = exports3.CompletionList = exports3.CompletionItem = exports3.CompletionItemLabelDetails = exports3.InsertTextMode = exports3.InsertReplaceEdit = exports3.CompletionItemTag = exports3.InsertTextFormat = exports3.CompletionItemKind = exports3.MarkupContent = exports3.MarkupKind = exports3.TextDocumentItem = exports3.OptionalVersionedTextDocumentIdentifier = exports3.VersionedTextDocumentIdentifier = exports3.TextDocumentIdentifier = exports3.WorkspaceChange = exports3.WorkspaceEdit = exports3.DeleteFile = exports3.RenameFile = exports3.CreateFile = exports3.TextDocumentEdit = exports3.AnnotatedTextEdit = exports3.ChangeAnnotationIdentifier = exports3.ChangeAnnotation = exports3.TextEdit = exports3.Command = exports3.Diagnostic = exports3.CodeDescription = exports3.DiagnosticTag = exports3.DiagnosticSeverity = exports3.DiagnosticRelatedInformation = exports3.FoldingRange = exports3.FoldingRangeKind = exports3.ColorPresentation = exports3.ColorInformation = exports3.Color = exports3.LocationLink = exports3.Location = exports3.Range = exports3.Position = exports3.uinteger = exports3.integer = exports3.URI = exports3.DocumentUri = void 0;
      var DocumentUri;
      (function(DocumentUri2) {
        function is(value) {
          return typeof value === "string";
        }
        DocumentUri2.is = is;
      })(DocumentUri || (exports3.DocumentUri = DocumentUri = {}));
      var URI;
      (function(URI2) {
        function is(value) {
          return typeof value === "string";
        }
        URI2.is = is;
      })(URI || (exports3.URI = URI = {}));
      var integer;
      (function(integer2) {
        integer2.MIN_VALUE = -2147483648;
        integer2.MAX_VALUE = 2147483647;
        function is(value) {
          return typeof value === "number" && integer2.MIN_VALUE <= value && value <= integer2.MAX_VALUE;
        }
        integer2.is = is;
      })(integer || (exports3.integer = integer = {}));
      var uinteger;
      (function(uinteger2) {
        uinteger2.MIN_VALUE = 0;
        uinteger2.MAX_VALUE = 2147483647;
        function is(value) {
          return typeof value === "number" && uinteger2.MIN_VALUE <= value && value <= uinteger2.MAX_VALUE;
        }
        uinteger2.is = is;
      })(uinteger || (exports3.uinteger = uinteger = {}));
      var Position2;
      (function(Position3) {
        function create(line, character) {
          if (line === Number.MAX_VALUE) {
            line = uinteger.MAX_VALUE;
          }
          if (character === Number.MAX_VALUE) {
            character = uinteger.MAX_VALUE;
          }
          return { line, character };
        }
        Position3.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Is.uinteger(candidate.line) && Is.uinteger(candidate.character);
        }
        Position3.is = is;
      })(Position2 || (exports3.Position = Position2 = {}));
      var Range;
      (function(Range2) {
        function create(one, two, three, four) {
          if (Is.uinteger(one) && Is.uinteger(two) && Is.uinteger(three) && Is.uinteger(four)) {
            return { start: Position2.create(one, two), end: Position2.create(three, four) };
          } else if (Position2.is(one) && Position2.is(two)) {
            return { start: one, end: two };
          } else {
            throw new Error("Range#create called with invalid arguments[".concat(one, ", ").concat(two, ", ").concat(three, ", ").concat(four, "]"));
          }
        }
        Range2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Position2.is(candidate.start) && Position2.is(candidate.end);
        }
        Range2.is = is;
      })(Range || (exports3.Range = Range = {}));
      var Location2;
      (function(Location3) {
        function create(uri, range) {
          return { uri, range };
        }
        Location3.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Range.is(candidate.range) && (Is.string(candidate.uri) || Is.undefined(candidate.uri));
        }
        Location3.is = is;
      })(Location2 || (exports3.Location = Location2 = {}));
      var LocationLink;
      (function(LocationLink2) {
        function create(targetUri, targetRange, targetSelectionRange, originSelectionRange) {
          return { targetUri, targetRange, targetSelectionRange, originSelectionRange };
        }
        LocationLink2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Range.is(candidate.targetRange) && Is.string(candidate.targetUri) && Range.is(candidate.targetSelectionRange) && (Range.is(candidate.originSelectionRange) || Is.undefined(candidate.originSelectionRange));
        }
        LocationLink2.is = is;
      })(LocationLink || (exports3.LocationLink = LocationLink = {}));
      var Color;
      (function(Color2) {
        function create(red, green, blue, alpha) {
          return {
            red,
            green,
            blue,
            alpha
          };
        }
        Color2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Is.numberRange(candidate.red, 0, 1) && Is.numberRange(candidate.green, 0, 1) && Is.numberRange(candidate.blue, 0, 1) && Is.numberRange(candidate.alpha, 0, 1);
        }
        Color2.is = is;
      })(Color || (exports3.Color = Color = {}));
      var ColorInformation;
      (function(ColorInformation2) {
        function create(range, color) {
          return {
            range,
            color
          };
        }
        ColorInformation2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Range.is(candidate.range) && Color.is(candidate.color);
        }
        ColorInformation2.is = is;
      })(ColorInformation || (exports3.ColorInformation = ColorInformation = {}));
      var ColorPresentation;
      (function(ColorPresentation2) {
        function create(label, textEdit, additionalTextEdits) {
          return {
            label,
            textEdit,
            additionalTextEdits
          };
        }
        ColorPresentation2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Is.string(candidate.label) && (Is.undefined(candidate.textEdit) || TextEdit.is(candidate)) && (Is.undefined(candidate.additionalTextEdits) || Is.typedArray(candidate.additionalTextEdits, TextEdit.is));
        }
        ColorPresentation2.is = is;
      })(ColorPresentation || (exports3.ColorPresentation = ColorPresentation = {}));
      var FoldingRangeKind;
      (function(FoldingRangeKind2) {
        FoldingRangeKind2.Comment = "comment";
        FoldingRangeKind2.Imports = "imports";
        FoldingRangeKind2.Region = "region";
      })(FoldingRangeKind || (exports3.FoldingRangeKind = FoldingRangeKind = {}));
      var FoldingRange;
      (function(FoldingRange2) {
        function create(startLine, endLine, startCharacter, endCharacter, kind, collapsedText) {
          var result = {
            startLine,
            endLine
          };
          if (Is.defined(startCharacter)) {
            result.startCharacter = startCharacter;
          }
          if (Is.defined(endCharacter)) {
            result.endCharacter = endCharacter;
          }
          if (Is.defined(kind)) {
            result.kind = kind;
          }
          if (Is.defined(collapsedText)) {
            result.collapsedText = collapsedText;
          }
          return result;
        }
        FoldingRange2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Is.uinteger(candidate.startLine) && Is.uinteger(candidate.startLine) && (Is.undefined(candidate.startCharacter) || Is.uinteger(candidate.startCharacter)) && (Is.undefined(candidate.endCharacter) || Is.uinteger(candidate.endCharacter)) && (Is.undefined(candidate.kind) || Is.string(candidate.kind));
        }
        FoldingRange2.is = is;
      })(FoldingRange || (exports3.FoldingRange = FoldingRange = {}));
      var DiagnosticRelatedInformation;
      (function(DiagnosticRelatedInformation2) {
        function create(location, message) {
          return {
            location,
            message
          };
        }
        DiagnosticRelatedInformation2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Location2.is(candidate.location) && Is.string(candidate.message);
        }
        DiagnosticRelatedInformation2.is = is;
      })(DiagnosticRelatedInformation || (exports3.DiagnosticRelatedInformation = DiagnosticRelatedInformation = {}));
      var DiagnosticSeverity2;
      (function(DiagnosticSeverity3) {
        DiagnosticSeverity3.Error = 1;
        DiagnosticSeverity3.Warning = 2;
        DiagnosticSeverity3.Information = 3;
        DiagnosticSeverity3.Hint = 4;
      })(DiagnosticSeverity2 || (exports3.DiagnosticSeverity = DiagnosticSeverity2 = {}));
      var DiagnosticTag;
      (function(DiagnosticTag2) {
        DiagnosticTag2.Unnecessary = 1;
        DiagnosticTag2.Deprecated = 2;
      })(DiagnosticTag || (exports3.DiagnosticTag = DiagnosticTag = {}));
      var CodeDescription;
      (function(CodeDescription2) {
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Is.string(candidate.href);
        }
        CodeDescription2.is = is;
      })(CodeDescription || (exports3.CodeDescription = CodeDescription = {}));
      var Diagnostic2;
      (function(Diagnostic3) {
        function create(range, message, severity, code, source, relatedInformation) {
          var result = { range, message };
          if (Is.defined(severity)) {
            result.severity = severity;
          }
          if (Is.defined(code)) {
            result.code = code;
          }
          if (Is.defined(source)) {
            result.source = source;
          }
          if (Is.defined(relatedInformation)) {
            result.relatedInformation = relatedInformation;
          }
          return result;
        }
        Diagnostic3.create = create;
        function is(value) {
          var _a;
          var candidate = value;
          return Is.defined(candidate) && Range.is(candidate.range) && Is.string(candidate.message) && (Is.number(candidate.severity) || Is.undefined(candidate.severity)) && (Is.integer(candidate.code) || Is.string(candidate.code) || Is.undefined(candidate.code)) && (Is.undefined(candidate.codeDescription) || Is.string((_a = candidate.codeDescription) === null || _a === void 0 ? void 0 : _a.href)) && (Is.string(candidate.source) || Is.undefined(candidate.source)) && (Is.undefined(candidate.relatedInformation) || Is.typedArray(candidate.relatedInformation, DiagnosticRelatedInformation.is));
        }
        Diagnostic3.is = is;
      })(Diagnostic2 || (exports3.Diagnostic = Diagnostic2 = {}));
      var Command;
      (function(Command2) {
        function create(title, command) {
          var args = [];
          for (var _i = 2; _i < arguments.length; _i++) {
            args[_i - 2] = arguments[_i];
          }
          var result = { title, command };
          if (Is.defined(args) && args.length > 0) {
            result.arguments = args;
          }
          return result;
        }
        Command2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Is.string(candidate.title) && Is.string(candidate.command);
        }
        Command2.is = is;
      })(Command || (exports3.Command = Command = {}));
      var TextEdit;
      (function(TextEdit2) {
        function replace(range, newText) {
          return { range, newText };
        }
        TextEdit2.replace = replace;
        function insert(position, newText) {
          return { range: { start: position, end: position }, newText };
        }
        TextEdit2.insert = insert;
        function del(range) {
          return { range, newText: "" };
        }
        TextEdit2.del = del;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Is.string(candidate.newText) && Range.is(candidate.range);
        }
        TextEdit2.is = is;
      })(TextEdit || (exports3.TextEdit = TextEdit = {}));
      var ChangeAnnotation;
      (function(ChangeAnnotation2) {
        function create(label, needsConfirmation, description) {
          var result = { label };
          if (needsConfirmation !== void 0) {
            result.needsConfirmation = needsConfirmation;
          }
          if (description !== void 0) {
            result.description = description;
          }
          return result;
        }
        ChangeAnnotation2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Is.string(candidate.label) && (Is.boolean(candidate.needsConfirmation) || candidate.needsConfirmation === void 0) && (Is.string(candidate.description) || candidate.description === void 0);
        }
        ChangeAnnotation2.is = is;
      })(ChangeAnnotation || (exports3.ChangeAnnotation = ChangeAnnotation = {}));
      var ChangeAnnotationIdentifier;
      (function(ChangeAnnotationIdentifier2) {
        function is(value) {
          var candidate = value;
          return Is.string(candidate);
        }
        ChangeAnnotationIdentifier2.is = is;
      })(ChangeAnnotationIdentifier || (exports3.ChangeAnnotationIdentifier = ChangeAnnotationIdentifier = {}));
      var AnnotatedTextEdit;
      (function(AnnotatedTextEdit2) {
        function replace(range, newText, annotation) {
          return { range, newText, annotationId: annotation };
        }
        AnnotatedTextEdit2.replace = replace;
        function insert(position, newText, annotation) {
          return { range: { start: position, end: position }, newText, annotationId: annotation };
        }
        AnnotatedTextEdit2.insert = insert;
        function del(range, annotation) {
          return { range, newText: "", annotationId: annotation };
        }
        AnnotatedTextEdit2.del = del;
        function is(value) {
          var candidate = value;
          return TextEdit.is(candidate) && (ChangeAnnotation.is(candidate.annotationId) || ChangeAnnotationIdentifier.is(candidate.annotationId));
        }
        AnnotatedTextEdit2.is = is;
      })(AnnotatedTextEdit || (exports3.AnnotatedTextEdit = AnnotatedTextEdit = {}));
      var TextDocumentEdit;
      (function(TextDocumentEdit2) {
        function create(textDocument, edits) {
          return { textDocument, edits };
        }
        TextDocumentEdit2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && OptionalVersionedTextDocumentIdentifier.is(candidate.textDocument) && Array.isArray(candidate.edits);
        }
        TextDocumentEdit2.is = is;
      })(TextDocumentEdit || (exports3.TextDocumentEdit = TextDocumentEdit = {}));
      var CreateFile;
      (function(CreateFile2) {
        function create(uri, options, annotation) {
          var result = {
            kind: "create",
            uri
          };
          if (options !== void 0 && (options.overwrite !== void 0 || options.ignoreIfExists !== void 0)) {
            result.options = options;
          }
          if (annotation !== void 0) {
            result.annotationId = annotation;
          }
          return result;
        }
        CreateFile2.create = create;
        function is(value) {
          var candidate = value;
          return candidate && candidate.kind === "create" && Is.string(candidate.uri) && (candidate.options === void 0 || (candidate.options.overwrite === void 0 || Is.boolean(candidate.options.overwrite)) && (candidate.options.ignoreIfExists === void 0 || Is.boolean(candidate.options.ignoreIfExists))) && (candidate.annotationId === void 0 || ChangeAnnotationIdentifier.is(candidate.annotationId));
        }
        CreateFile2.is = is;
      })(CreateFile || (exports3.CreateFile = CreateFile = {}));
      var RenameFile;
      (function(RenameFile2) {
        function create(oldUri, newUri, options, annotation) {
          var result = {
            kind: "rename",
            oldUri,
            newUri
          };
          if (options !== void 0 && (options.overwrite !== void 0 || options.ignoreIfExists !== void 0)) {
            result.options = options;
          }
          if (annotation !== void 0) {
            result.annotationId = annotation;
          }
          return result;
        }
        RenameFile2.create = create;
        function is(value) {
          var candidate = value;
          return candidate && candidate.kind === "rename" && Is.string(candidate.oldUri) && Is.string(candidate.newUri) && (candidate.options === void 0 || (candidate.options.overwrite === void 0 || Is.boolean(candidate.options.overwrite)) && (candidate.options.ignoreIfExists === void 0 || Is.boolean(candidate.options.ignoreIfExists))) && (candidate.annotationId === void 0 || ChangeAnnotationIdentifier.is(candidate.annotationId));
        }
        RenameFile2.is = is;
      })(RenameFile || (exports3.RenameFile = RenameFile = {}));
      var DeleteFile;
      (function(DeleteFile2) {
        function create(uri, options, annotation) {
          var result = {
            kind: "delete",
            uri
          };
          if (options !== void 0 && (options.recursive !== void 0 || options.ignoreIfNotExists !== void 0)) {
            result.options = options;
          }
          if (annotation !== void 0) {
            result.annotationId = annotation;
          }
          return result;
        }
        DeleteFile2.create = create;
        function is(value) {
          var candidate = value;
          return candidate && candidate.kind === "delete" && Is.string(candidate.uri) && (candidate.options === void 0 || (candidate.options.recursive === void 0 || Is.boolean(candidate.options.recursive)) && (candidate.options.ignoreIfNotExists === void 0 || Is.boolean(candidate.options.ignoreIfNotExists))) && (candidate.annotationId === void 0 || ChangeAnnotationIdentifier.is(candidate.annotationId));
        }
        DeleteFile2.is = is;
      })(DeleteFile || (exports3.DeleteFile = DeleteFile = {}));
      var WorkspaceEdit2;
      (function(WorkspaceEdit3) {
        function is(value) {
          var candidate = value;
          return candidate && (candidate.changes !== void 0 || candidate.documentChanges !== void 0) && (candidate.documentChanges === void 0 || candidate.documentChanges.every(function(change) {
            if (Is.string(change.kind)) {
              return CreateFile.is(change) || RenameFile.is(change) || DeleteFile.is(change);
            } else {
              return TextDocumentEdit.is(change);
            }
          }));
        }
        WorkspaceEdit3.is = is;
      })(WorkspaceEdit2 || (exports3.WorkspaceEdit = WorkspaceEdit2 = {}));
      var TextEditChangeImpl = (
        /** @class */
        (function() {
          function TextEditChangeImpl2(edits, changeAnnotations) {
            this.edits = edits;
            this.changeAnnotations = changeAnnotations;
          }
          TextEditChangeImpl2.prototype.insert = function(position, newText, annotation) {
            var edit;
            var id;
            if (annotation === void 0) {
              edit = TextEdit.insert(position, newText);
            } else if (ChangeAnnotationIdentifier.is(annotation)) {
              id = annotation;
              edit = AnnotatedTextEdit.insert(position, newText, annotation);
            } else {
              this.assertChangeAnnotations(this.changeAnnotations);
              id = this.changeAnnotations.manage(annotation);
              edit = AnnotatedTextEdit.insert(position, newText, id);
            }
            this.edits.push(edit);
            if (id !== void 0) {
              return id;
            }
          };
          TextEditChangeImpl2.prototype.replace = function(range, newText, annotation) {
            var edit;
            var id;
            if (annotation === void 0) {
              edit = TextEdit.replace(range, newText);
            } else if (ChangeAnnotationIdentifier.is(annotation)) {
              id = annotation;
              edit = AnnotatedTextEdit.replace(range, newText, annotation);
            } else {
              this.assertChangeAnnotations(this.changeAnnotations);
              id = this.changeAnnotations.manage(annotation);
              edit = AnnotatedTextEdit.replace(range, newText, id);
            }
            this.edits.push(edit);
            if (id !== void 0) {
              return id;
            }
          };
          TextEditChangeImpl2.prototype.delete = function(range, annotation) {
            var edit;
            var id;
            if (annotation === void 0) {
              edit = TextEdit.del(range);
            } else if (ChangeAnnotationIdentifier.is(annotation)) {
              id = annotation;
              edit = AnnotatedTextEdit.del(range, annotation);
            } else {
              this.assertChangeAnnotations(this.changeAnnotations);
              id = this.changeAnnotations.manage(annotation);
              edit = AnnotatedTextEdit.del(range, id);
            }
            this.edits.push(edit);
            if (id !== void 0) {
              return id;
            }
          };
          TextEditChangeImpl2.prototype.add = function(edit) {
            this.edits.push(edit);
          };
          TextEditChangeImpl2.prototype.all = function() {
            return this.edits;
          };
          TextEditChangeImpl2.prototype.clear = function() {
            this.edits.splice(0, this.edits.length);
          };
          TextEditChangeImpl2.prototype.assertChangeAnnotations = function(value) {
            if (value === void 0) {
              throw new Error("Text edit change is not configured to manage change annotations.");
            }
          };
          return TextEditChangeImpl2;
        })()
      );
      var ChangeAnnotations = (
        /** @class */
        (function() {
          function ChangeAnnotations2(annotations) {
            this._annotations = annotations === void 0 ? /* @__PURE__ */ Object.create(null) : annotations;
            this._counter = 0;
            this._size = 0;
          }
          ChangeAnnotations2.prototype.all = function() {
            return this._annotations;
          };
          Object.defineProperty(ChangeAnnotations2.prototype, "size", {
            get: function() {
              return this._size;
            },
            enumerable: false,
            configurable: true
          });
          ChangeAnnotations2.prototype.manage = function(idOrAnnotation, annotation) {
            var id;
            if (ChangeAnnotationIdentifier.is(idOrAnnotation)) {
              id = idOrAnnotation;
            } else {
              id = this.nextId();
              annotation = idOrAnnotation;
            }
            if (this._annotations[id] !== void 0) {
              throw new Error("Id ".concat(id, " is already in use."));
            }
            if (annotation === void 0) {
              throw new Error("No annotation provided for id ".concat(id));
            }
            this._annotations[id] = annotation;
            this._size++;
            return id;
          };
          ChangeAnnotations2.prototype.nextId = function() {
            this._counter++;
            return this._counter.toString();
          };
          return ChangeAnnotations2;
        })()
      );
      var WorkspaceChange = (
        /** @class */
        (function() {
          function WorkspaceChange2(workspaceEdit) {
            var _this = this;
            this._textEditChanges = /* @__PURE__ */ Object.create(null);
            if (workspaceEdit !== void 0) {
              this._workspaceEdit = workspaceEdit;
              if (workspaceEdit.documentChanges) {
                this._changeAnnotations = new ChangeAnnotations(workspaceEdit.changeAnnotations);
                workspaceEdit.changeAnnotations = this._changeAnnotations.all();
                workspaceEdit.documentChanges.forEach(function(change) {
                  if (TextDocumentEdit.is(change)) {
                    var textEditChange = new TextEditChangeImpl(change.edits, _this._changeAnnotations);
                    _this._textEditChanges[change.textDocument.uri] = textEditChange;
                  }
                });
              } else if (workspaceEdit.changes) {
                Object.keys(workspaceEdit.changes).forEach(function(key) {
                  var textEditChange = new TextEditChangeImpl(workspaceEdit.changes[key]);
                  _this._textEditChanges[key] = textEditChange;
                });
              }
            } else {
              this._workspaceEdit = {};
            }
          }
          Object.defineProperty(WorkspaceChange2.prototype, "edit", {
            /**
             * Returns the underlying {@link WorkspaceEdit} literal
             * use to be returned from a workspace edit operation like rename.
             */
            get: function() {
              this.initDocumentChanges();
              if (this._changeAnnotations !== void 0) {
                if (this._changeAnnotations.size === 0) {
                  this._workspaceEdit.changeAnnotations = void 0;
                } else {
                  this._workspaceEdit.changeAnnotations = this._changeAnnotations.all();
                }
              }
              return this._workspaceEdit;
            },
            enumerable: false,
            configurable: true
          });
          WorkspaceChange2.prototype.getTextEditChange = function(key) {
            if (OptionalVersionedTextDocumentIdentifier.is(key)) {
              this.initDocumentChanges();
              if (this._workspaceEdit.documentChanges === void 0) {
                throw new Error("Workspace edit is not configured for document changes.");
              }
              var textDocument = { uri: key.uri, version: key.version };
              var result = this._textEditChanges[textDocument.uri];
              if (!result) {
                var edits = [];
                var textDocumentEdit = {
                  textDocument,
                  edits
                };
                this._workspaceEdit.documentChanges.push(textDocumentEdit);
                result = new TextEditChangeImpl(edits, this._changeAnnotations);
                this._textEditChanges[textDocument.uri] = result;
              }
              return result;
            } else {
              this.initChanges();
              if (this._workspaceEdit.changes === void 0) {
                throw new Error("Workspace edit is not configured for normal text edit changes.");
              }
              var result = this._textEditChanges[key];
              if (!result) {
                var edits = [];
                this._workspaceEdit.changes[key] = edits;
                result = new TextEditChangeImpl(edits);
                this._textEditChanges[key] = result;
              }
              return result;
            }
          };
          WorkspaceChange2.prototype.initDocumentChanges = function() {
            if (this._workspaceEdit.documentChanges === void 0 && this._workspaceEdit.changes === void 0) {
              this._changeAnnotations = new ChangeAnnotations();
              this._workspaceEdit.documentChanges = [];
              this._workspaceEdit.changeAnnotations = this._changeAnnotations.all();
            }
          };
          WorkspaceChange2.prototype.initChanges = function() {
            if (this._workspaceEdit.documentChanges === void 0 && this._workspaceEdit.changes === void 0) {
              this._workspaceEdit.changes = /* @__PURE__ */ Object.create(null);
            }
          };
          WorkspaceChange2.prototype.createFile = function(uri, optionsOrAnnotation, options) {
            this.initDocumentChanges();
            if (this._workspaceEdit.documentChanges === void 0) {
              throw new Error("Workspace edit is not configured for document changes.");
            }
            var annotation;
            if (ChangeAnnotation.is(optionsOrAnnotation) || ChangeAnnotationIdentifier.is(optionsOrAnnotation)) {
              annotation = optionsOrAnnotation;
            } else {
              options = optionsOrAnnotation;
            }
            var operation;
            var id;
            if (annotation === void 0) {
              operation = CreateFile.create(uri, options);
            } else {
              id = ChangeAnnotationIdentifier.is(annotation) ? annotation : this._changeAnnotations.manage(annotation);
              operation = CreateFile.create(uri, options, id);
            }
            this._workspaceEdit.documentChanges.push(operation);
            if (id !== void 0) {
              return id;
            }
          };
          WorkspaceChange2.prototype.renameFile = function(oldUri, newUri, optionsOrAnnotation, options) {
            this.initDocumentChanges();
            if (this._workspaceEdit.documentChanges === void 0) {
              throw new Error("Workspace edit is not configured for document changes.");
            }
            var annotation;
            if (ChangeAnnotation.is(optionsOrAnnotation) || ChangeAnnotationIdentifier.is(optionsOrAnnotation)) {
              annotation = optionsOrAnnotation;
            } else {
              options = optionsOrAnnotation;
            }
            var operation;
            var id;
            if (annotation === void 0) {
              operation = RenameFile.create(oldUri, newUri, options);
            } else {
              id = ChangeAnnotationIdentifier.is(annotation) ? annotation : this._changeAnnotations.manage(annotation);
              operation = RenameFile.create(oldUri, newUri, options, id);
            }
            this._workspaceEdit.documentChanges.push(operation);
            if (id !== void 0) {
              return id;
            }
          };
          WorkspaceChange2.prototype.deleteFile = function(uri, optionsOrAnnotation, options) {
            this.initDocumentChanges();
            if (this._workspaceEdit.documentChanges === void 0) {
              throw new Error("Workspace edit is not configured for document changes.");
            }
            var annotation;
            if (ChangeAnnotation.is(optionsOrAnnotation) || ChangeAnnotationIdentifier.is(optionsOrAnnotation)) {
              annotation = optionsOrAnnotation;
            } else {
              options = optionsOrAnnotation;
            }
            var operation;
            var id;
            if (annotation === void 0) {
              operation = DeleteFile.create(uri, options);
            } else {
              id = ChangeAnnotationIdentifier.is(annotation) ? annotation : this._changeAnnotations.manage(annotation);
              operation = DeleteFile.create(uri, options, id);
            }
            this._workspaceEdit.documentChanges.push(operation);
            if (id !== void 0) {
              return id;
            }
          };
          return WorkspaceChange2;
        })()
      );
      exports3.WorkspaceChange = WorkspaceChange;
      var TextDocumentIdentifier;
      (function(TextDocumentIdentifier2) {
        function create(uri) {
          return { uri };
        }
        TextDocumentIdentifier2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Is.string(candidate.uri);
        }
        TextDocumentIdentifier2.is = is;
      })(TextDocumentIdentifier || (exports3.TextDocumentIdentifier = TextDocumentIdentifier = {}));
      var VersionedTextDocumentIdentifier;
      (function(VersionedTextDocumentIdentifier2) {
        function create(uri, version) {
          return { uri, version };
        }
        VersionedTextDocumentIdentifier2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Is.string(candidate.uri) && Is.integer(candidate.version);
        }
        VersionedTextDocumentIdentifier2.is = is;
      })(VersionedTextDocumentIdentifier || (exports3.VersionedTextDocumentIdentifier = VersionedTextDocumentIdentifier = {}));
      var OptionalVersionedTextDocumentIdentifier;
      (function(OptionalVersionedTextDocumentIdentifier2) {
        function create(uri, version) {
          return { uri, version };
        }
        OptionalVersionedTextDocumentIdentifier2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Is.string(candidate.uri) && (candidate.version === null || Is.integer(candidate.version));
        }
        OptionalVersionedTextDocumentIdentifier2.is = is;
      })(OptionalVersionedTextDocumentIdentifier || (exports3.OptionalVersionedTextDocumentIdentifier = OptionalVersionedTextDocumentIdentifier = {}));
      var TextDocumentItem;
      (function(TextDocumentItem2) {
        function create(uri, languageId, version, text) {
          return { uri, languageId, version, text };
        }
        TextDocumentItem2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Is.string(candidate.uri) && Is.string(candidate.languageId) && Is.integer(candidate.version) && Is.string(candidate.text);
        }
        TextDocumentItem2.is = is;
      })(TextDocumentItem || (exports3.TextDocumentItem = TextDocumentItem = {}));
      var MarkupKind2;
      (function(MarkupKind3) {
        MarkupKind3.PlainText = "plaintext";
        MarkupKind3.Markdown = "markdown";
        function is(value) {
          var candidate = value;
          return candidate === MarkupKind3.PlainText || candidate === MarkupKind3.Markdown;
        }
        MarkupKind3.is = is;
      })(MarkupKind2 || (exports3.MarkupKind = MarkupKind2 = {}));
      var MarkupContent2;
      (function(MarkupContent3) {
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(value) && MarkupKind2.is(candidate.kind) && Is.string(candidate.value);
        }
        MarkupContent3.is = is;
      })(MarkupContent2 || (exports3.MarkupContent = MarkupContent2 = {}));
      var CompletionItemKind2;
      (function(CompletionItemKind3) {
        CompletionItemKind3.Text = 1;
        CompletionItemKind3.Method = 2;
        CompletionItemKind3.Function = 3;
        CompletionItemKind3.Constructor = 4;
        CompletionItemKind3.Field = 5;
        CompletionItemKind3.Variable = 6;
        CompletionItemKind3.Class = 7;
        CompletionItemKind3.Interface = 8;
        CompletionItemKind3.Module = 9;
        CompletionItemKind3.Property = 10;
        CompletionItemKind3.Unit = 11;
        CompletionItemKind3.Value = 12;
        CompletionItemKind3.Enum = 13;
        CompletionItemKind3.Keyword = 14;
        CompletionItemKind3.Snippet = 15;
        CompletionItemKind3.Color = 16;
        CompletionItemKind3.File = 17;
        CompletionItemKind3.Reference = 18;
        CompletionItemKind3.Folder = 19;
        CompletionItemKind3.EnumMember = 20;
        CompletionItemKind3.Constant = 21;
        CompletionItemKind3.Struct = 22;
        CompletionItemKind3.Event = 23;
        CompletionItemKind3.Operator = 24;
        CompletionItemKind3.TypeParameter = 25;
      })(CompletionItemKind2 || (exports3.CompletionItemKind = CompletionItemKind2 = {}));
      var InsertTextFormat;
      (function(InsertTextFormat2) {
        InsertTextFormat2.PlainText = 1;
        InsertTextFormat2.Snippet = 2;
      })(InsertTextFormat || (exports3.InsertTextFormat = InsertTextFormat = {}));
      var CompletionItemTag;
      (function(CompletionItemTag2) {
        CompletionItemTag2.Deprecated = 1;
      })(CompletionItemTag || (exports3.CompletionItemTag = CompletionItemTag = {}));
      var InsertReplaceEdit;
      (function(InsertReplaceEdit2) {
        function create(newText, insert, replace) {
          return { newText, insert, replace };
        }
        InsertReplaceEdit2.create = create;
        function is(value) {
          var candidate = value;
          return candidate && Is.string(candidate.newText) && Range.is(candidate.insert) && Range.is(candidate.replace);
        }
        InsertReplaceEdit2.is = is;
      })(InsertReplaceEdit || (exports3.InsertReplaceEdit = InsertReplaceEdit = {}));
      var InsertTextMode;
      (function(InsertTextMode2) {
        InsertTextMode2.asIs = 1;
        InsertTextMode2.adjustIndentation = 2;
      })(InsertTextMode || (exports3.InsertTextMode = InsertTextMode = {}));
      var CompletionItemLabelDetails;
      (function(CompletionItemLabelDetails2) {
        function is(value) {
          var candidate = value;
          return candidate && (Is.string(candidate.detail) || candidate.detail === void 0) && (Is.string(candidate.description) || candidate.description === void 0);
        }
        CompletionItemLabelDetails2.is = is;
      })(CompletionItemLabelDetails || (exports3.CompletionItemLabelDetails = CompletionItemLabelDetails = {}));
      var CompletionItem2;
      (function(CompletionItem3) {
        function create(label) {
          return { label };
        }
        CompletionItem3.create = create;
      })(CompletionItem2 || (exports3.CompletionItem = CompletionItem2 = {}));
      var CompletionList;
      (function(CompletionList2) {
        function create(items, isIncomplete) {
          return { items: items ? items : [], isIncomplete: !!isIncomplete };
        }
        CompletionList2.create = create;
      })(CompletionList || (exports3.CompletionList = CompletionList = {}));
      var MarkedString;
      (function(MarkedString2) {
        function fromPlainText(plainText) {
          return plainText.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&");
        }
        MarkedString2.fromPlainText = fromPlainText;
        function is(value) {
          var candidate = value;
          return Is.string(candidate) || Is.objectLiteral(candidate) && Is.string(candidate.language) && Is.string(candidate.value);
        }
        MarkedString2.is = is;
      })(MarkedString || (exports3.MarkedString = MarkedString = {}));
      var Hover2;
      (function(Hover3) {
        function is(value) {
          var candidate = value;
          return !!candidate && Is.objectLiteral(candidate) && (MarkupContent2.is(candidate.contents) || MarkedString.is(candidate.contents) || Is.typedArray(candidate.contents, MarkedString.is)) && (value.range === void 0 || Range.is(value.range));
        }
        Hover3.is = is;
      })(Hover2 || (exports3.Hover = Hover2 = {}));
      var ParameterInformation2;
      (function(ParameterInformation3) {
        function create(label, documentation) {
          return documentation ? { label, documentation } : { label };
        }
        ParameterInformation3.create = create;
      })(ParameterInformation2 || (exports3.ParameterInformation = ParameterInformation2 = {}));
      var SignatureInformation2;
      (function(SignatureInformation3) {
        function create(label, documentation) {
          var parameters = [];
          for (var _i = 2; _i < arguments.length; _i++) {
            parameters[_i - 2] = arguments[_i];
          }
          var result = { label };
          if (Is.defined(documentation)) {
            result.documentation = documentation;
          }
          if (Is.defined(parameters)) {
            result.parameters = parameters;
          } else {
            result.parameters = [];
          }
          return result;
        }
        SignatureInformation3.create = create;
      })(SignatureInformation2 || (exports3.SignatureInformation = SignatureInformation2 = {}));
      var DocumentHighlightKind;
      (function(DocumentHighlightKind2) {
        DocumentHighlightKind2.Text = 1;
        DocumentHighlightKind2.Read = 2;
        DocumentHighlightKind2.Write = 3;
      })(DocumentHighlightKind || (exports3.DocumentHighlightKind = DocumentHighlightKind = {}));
      var DocumentHighlight;
      (function(DocumentHighlight2) {
        function create(range, kind) {
          var result = { range };
          if (Is.number(kind)) {
            result.kind = kind;
          }
          return result;
        }
        DocumentHighlight2.create = create;
      })(DocumentHighlight || (exports3.DocumentHighlight = DocumentHighlight = {}));
      var SymbolKind;
      (function(SymbolKind2) {
        SymbolKind2.File = 1;
        SymbolKind2.Module = 2;
        SymbolKind2.Namespace = 3;
        SymbolKind2.Package = 4;
        SymbolKind2.Class = 5;
        SymbolKind2.Method = 6;
        SymbolKind2.Property = 7;
        SymbolKind2.Field = 8;
        SymbolKind2.Constructor = 9;
        SymbolKind2.Enum = 10;
        SymbolKind2.Interface = 11;
        SymbolKind2.Function = 12;
        SymbolKind2.Variable = 13;
        SymbolKind2.Constant = 14;
        SymbolKind2.String = 15;
        SymbolKind2.Number = 16;
        SymbolKind2.Boolean = 17;
        SymbolKind2.Array = 18;
        SymbolKind2.Object = 19;
        SymbolKind2.Key = 20;
        SymbolKind2.Null = 21;
        SymbolKind2.EnumMember = 22;
        SymbolKind2.Struct = 23;
        SymbolKind2.Event = 24;
        SymbolKind2.Operator = 25;
        SymbolKind2.TypeParameter = 26;
      })(SymbolKind || (exports3.SymbolKind = SymbolKind = {}));
      var SymbolTag;
      (function(SymbolTag2) {
        SymbolTag2.Deprecated = 1;
      })(SymbolTag || (exports3.SymbolTag = SymbolTag = {}));
      var SymbolInformation;
      (function(SymbolInformation2) {
        function create(name, kind, range, uri, containerName) {
          var result = {
            name,
            kind,
            location: { uri, range }
          };
          if (containerName) {
            result.containerName = containerName;
          }
          return result;
        }
        SymbolInformation2.create = create;
      })(SymbolInformation || (exports3.SymbolInformation = SymbolInformation = {}));
      var WorkspaceSymbol;
      (function(WorkspaceSymbol2) {
        function create(name, kind, uri, range) {
          return range !== void 0 ? { name, kind, location: { uri, range } } : { name, kind, location: { uri } };
        }
        WorkspaceSymbol2.create = create;
      })(WorkspaceSymbol || (exports3.WorkspaceSymbol = WorkspaceSymbol = {}));
      var DocumentSymbol;
      (function(DocumentSymbol2) {
        function create(name, detail, kind, range, selectionRange, children) {
          var result = {
            name,
            detail,
            kind,
            range,
            selectionRange
          };
          if (children !== void 0) {
            result.children = children;
          }
          return result;
        }
        DocumentSymbol2.create = create;
        function is(value) {
          var candidate = value;
          return candidate && Is.string(candidate.name) && Is.number(candidate.kind) && Range.is(candidate.range) && Range.is(candidate.selectionRange) && (candidate.detail === void 0 || Is.string(candidate.detail)) && (candidate.deprecated === void 0 || Is.boolean(candidate.deprecated)) && (candidate.children === void 0 || Array.isArray(candidate.children)) && (candidate.tags === void 0 || Array.isArray(candidate.tags));
        }
        DocumentSymbol2.is = is;
      })(DocumentSymbol || (exports3.DocumentSymbol = DocumentSymbol = {}));
      var CodeActionKind;
      (function(CodeActionKind2) {
        CodeActionKind2.Empty = "";
        CodeActionKind2.QuickFix = "quickfix";
        CodeActionKind2.Refactor = "refactor";
        CodeActionKind2.RefactorExtract = "refactor.extract";
        CodeActionKind2.RefactorInline = "refactor.inline";
        CodeActionKind2.RefactorRewrite = "refactor.rewrite";
        CodeActionKind2.Source = "source";
        CodeActionKind2.SourceOrganizeImports = "source.organizeImports";
        CodeActionKind2.SourceFixAll = "source.fixAll";
      })(CodeActionKind || (exports3.CodeActionKind = CodeActionKind = {}));
      var CodeActionTriggerKind;
      (function(CodeActionTriggerKind2) {
        CodeActionTriggerKind2.Invoked = 1;
        CodeActionTriggerKind2.Automatic = 2;
      })(CodeActionTriggerKind || (exports3.CodeActionTriggerKind = CodeActionTriggerKind = {}));
      var CodeActionContext;
      (function(CodeActionContext2) {
        function create(diagnostics, only, triggerKind) {
          var result = { diagnostics };
          if (only !== void 0 && only !== null) {
            result.only = only;
          }
          if (triggerKind !== void 0 && triggerKind !== null) {
            result.triggerKind = triggerKind;
          }
          return result;
        }
        CodeActionContext2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Is.typedArray(candidate.diagnostics, Diagnostic2.is) && (candidate.only === void 0 || Is.typedArray(candidate.only, Is.string)) && (candidate.triggerKind === void 0 || candidate.triggerKind === CodeActionTriggerKind.Invoked || candidate.triggerKind === CodeActionTriggerKind.Automatic);
        }
        CodeActionContext2.is = is;
      })(CodeActionContext || (exports3.CodeActionContext = CodeActionContext = {}));
      var CodeAction;
      (function(CodeAction2) {
        function create(title, kindOrCommandOrEdit, kind) {
          var result = { title };
          var checkKind = true;
          if (typeof kindOrCommandOrEdit === "string") {
            checkKind = false;
            result.kind = kindOrCommandOrEdit;
          } else if (Command.is(kindOrCommandOrEdit)) {
            result.command = kindOrCommandOrEdit;
          } else {
            result.edit = kindOrCommandOrEdit;
          }
          if (checkKind && kind !== void 0) {
            result.kind = kind;
          }
          return result;
        }
        CodeAction2.create = create;
        function is(value) {
          var candidate = value;
          return candidate && Is.string(candidate.title) && (candidate.diagnostics === void 0 || Is.typedArray(candidate.diagnostics, Diagnostic2.is)) && (candidate.kind === void 0 || Is.string(candidate.kind)) && (candidate.edit !== void 0 || candidate.command !== void 0) && (candidate.command === void 0 || Command.is(candidate.command)) && (candidate.isPreferred === void 0 || Is.boolean(candidate.isPreferred)) && (candidate.edit === void 0 || WorkspaceEdit2.is(candidate.edit));
        }
        CodeAction2.is = is;
      })(CodeAction || (exports3.CodeAction = CodeAction = {}));
      var CodeLens;
      (function(CodeLens2) {
        function create(range, data) {
          var result = { range };
          if (Is.defined(data)) {
            result.data = data;
          }
          return result;
        }
        CodeLens2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Range.is(candidate.range) && (Is.undefined(candidate.command) || Command.is(candidate.command));
        }
        CodeLens2.is = is;
      })(CodeLens || (exports3.CodeLens = CodeLens = {}));
      var FormattingOptions;
      (function(FormattingOptions2) {
        function create(tabSize, insertSpaces) {
          return { tabSize, insertSpaces };
        }
        FormattingOptions2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Is.uinteger(candidate.tabSize) && Is.boolean(candidate.insertSpaces);
        }
        FormattingOptions2.is = is;
      })(FormattingOptions || (exports3.FormattingOptions = FormattingOptions = {}));
      var DocumentLink;
      (function(DocumentLink2) {
        function create(range, target, data) {
          return { range, target, data };
        }
        DocumentLink2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Range.is(candidate.range) && (Is.undefined(candidate.target) || Is.string(candidate.target));
        }
        DocumentLink2.is = is;
      })(DocumentLink || (exports3.DocumentLink = DocumentLink = {}));
      var SelectionRange;
      (function(SelectionRange2) {
        function create(range, parent) {
          return { range, parent };
        }
        SelectionRange2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Range.is(candidate.range) && (candidate.parent === void 0 || SelectionRange2.is(candidate.parent));
        }
        SelectionRange2.is = is;
      })(SelectionRange || (exports3.SelectionRange = SelectionRange = {}));
      var SemanticTokenTypes;
      (function(SemanticTokenTypes2) {
        SemanticTokenTypes2["namespace"] = "namespace";
        SemanticTokenTypes2["type"] = "type";
        SemanticTokenTypes2["class"] = "class";
        SemanticTokenTypes2["enum"] = "enum";
        SemanticTokenTypes2["interface"] = "interface";
        SemanticTokenTypes2["struct"] = "struct";
        SemanticTokenTypes2["typeParameter"] = "typeParameter";
        SemanticTokenTypes2["parameter"] = "parameter";
        SemanticTokenTypes2["variable"] = "variable";
        SemanticTokenTypes2["property"] = "property";
        SemanticTokenTypes2["enumMember"] = "enumMember";
        SemanticTokenTypes2["event"] = "event";
        SemanticTokenTypes2["function"] = "function";
        SemanticTokenTypes2["method"] = "method";
        SemanticTokenTypes2["macro"] = "macro";
        SemanticTokenTypes2["keyword"] = "keyword";
        SemanticTokenTypes2["modifier"] = "modifier";
        SemanticTokenTypes2["comment"] = "comment";
        SemanticTokenTypes2["string"] = "string";
        SemanticTokenTypes2["number"] = "number";
        SemanticTokenTypes2["regexp"] = "regexp";
        SemanticTokenTypes2["operator"] = "operator";
        SemanticTokenTypes2["decorator"] = "decorator";
      })(SemanticTokenTypes || (exports3.SemanticTokenTypes = SemanticTokenTypes = {}));
      var SemanticTokenModifiers;
      (function(SemanticTokenModifiers2) {
        SemanticTokenModifiers2["declaration"] = "declaration";
        SemanticTokenModifiers2["definition"] = "definition";
        SemanticTokenModifiers2["readonly"] = "readonly";
        SemanticTokenModifiers2["static"] = "static";
        SemanticTokenModifiers2["deprecated"] = "deprecated";
        SemanticTokenModifiers2["abstract"] = "abstract";
        SemanticTokenModifiers2["async"] = "async";
        SemanticTokenModifiers2["modification"] = "modification";
        SemanticTokenModifiers2["documentation"] = "documentation";
        SemanticTokenModifiers2["defaultLibrary"] = "defaultLibrary";
      })(SemanticTokenModifiers || (exports3.SemanticTokenModifiers = SemanticTokenModifiers = {}));
      var SemanticTokens;
      (function(SemanticTokens2) {
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && (candidate.resultId === void 0 || typeof candidate.resultId === "string") && Array.isArray(candidate.data) && (candidate.data.length === 0 || typeof candidate.data[0] === "number");
        }
        SemanticTokens2.is = is;
      })(SemanticTokens || (exports3.SemanticTokens = SemanticTokens = {}));
      var InlineValueText;
      (function(InlineValueText2) {
        function create(range, text) {
          return { range, text };
        }
        InlineValueText2.create = create;
        function is(value) {
          var candidate = value;
          return candidate !== void 0 && candidate !== null && Range.is(candidate.range) && Is.string(candidate.text);
        }
        InlineValueText2.is = is;
      })(InlineValueText || (exports3.InlineValueText = InlineValueText = {}));
      var InlineValueVariableLookup;
      (function(InlineValueVariableLookup2) {
        function create(range, variableName, caseSensitiveLookup) {
          return { range, variableName, caseSensitiveLookup };
        }
        InlineValueVariableLookup2.create = create;
        function is(value) {
          var candidate = value;
          return candidate !== void 0 && candidate !== null && Range.is(candidate.range) && Is.boolean(candidate.caseSensitiveLookup) && (Is.string(candidate.variableName) || candidate.variableName === void 0);
        }
        InlineValueVariableLookup2.is = is;
      })(InlineValueVariableLookup || (exports3.InlineValueVariableLookup = InlineValueVariableLookup = {}));
      var InlineValueEvaluatableExpression;
      (function(InlineValueEvaluatableExpression2) {
        function create(range, expression) {
          return { range, expression };
        }
        InlineValueEvaluatableExpression2.create = create;
        function is(value) {
          var candidate = value;
          return candidate !== void 0 && candidate !== null && Range.is(candidate.range) && (Is.string(candidate.expression) || candidate.expression === void 0);
        }
        InlineValueEvaluatableExpression2.is = is;
      })(InlineValueEvaluatableExpression || (exports3.InlineValueEvaluatableExpression = InlineValueEvaluatableExpression = {}));
      var InlineValueContext;
      (function(InlineValueContext2) {
        function create(frameId, stoppedLocation) {
          return { frameId, stoppedLocation };
        }
        InlineValueContext2.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Range.is(value.stoppedLocation);
        }
        InlineValueContext2.is = is;
      })(InlineValueContext || (exports3.InlineValueContext = InlineValueContext = {}));
      var InlayHintKind2;
      (function(InlayHintKind3) {
        InlayHintKind3.Type = 1;
        InlayHintKind3.Parameter = 2;
        function is(value) {
          return value === 1 || value === 2;
        }
        InlayHintKind3.is = is;
      })(InlayHintKind2 || (exports3.InlayHintKind = InlayHintKind2 = {}));
      var InlayHintLabelPart;
      (function(InlayHintLabelPart2) {
        function create(value) {
          return { value };
        }
        InlayHintLabelPart2.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && (candidate.tooltip === void 0 || Is.string(candidate.tooltip) || MarkupContent2.is(candidate.tooltip)) && (candidate.location === void 0 || Location2.is(candidate.location)) && (candidate.command === void 0 || Command.is(candidate.command));
        }
        InlayHintLabelPart2.is = is;
      })(InlayHintLabelPart || (exports3.InlayHintLabelPart = InlayHintLabelPart = {}));
      var InlayHint2;
      (function(InlayHint3) {
        function create(position, label, kind) {
          var result = { position, label };
          if (kind !== void 0) {
            result.kind = kind;
          }
          return result;
        }
        InlayHint3.create = create;
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && Position2.is(candidate.position) && (Is.string(candidate.label) || Is.typedArray(candidate.label, InlayHintLabelPart.is)) && (candidate.kind === void 0 || InlayHintKind2.is(candidate.kind)) && candidate.textEdits === void 0 || Is.typedArray(candidate.textEdits, TextEdit.is) && (candidate.tooltip === void 0 || Is.string(candidate.tooltip) || MarkupContent2.is(candidate.tooltip)) && (candidate.paddingLeft === void 0 || Is.boolean(candidate.paddingLeft)) && (candidate.paddingRight === void 0 || Is.boolean(candidate.paddingRight));
        }
        InlayHint3.is = is;
      })(InlayHint2 || (exports3.InlayHint = InlayHint2 = {}));
      var StringValue;
      (function(StringValue2) {
        function createSnippet(value) {
          return { kind: "snippet", value };
        }
        StringValue2.createSnippet = createSnippet;
      })(StringValue || (exports3.StringValue = StringValue = {}));
      var InlineCompletionItem;
      (function(InlineCompletionItem2) {
        function create(insertText, filterText, range, command) {
          return { insertText, filterText, range, command };
        }
        InlineCompletionItem2.create = create;
      })(InlineCompletionItem || (exports3.InlineCompletionItem = InlineCompletionItem = {}));
      var InlineCompletionList;
      (function(InlineCompletionList2) {
        function create(items) {
          return { items };
        }
        InlineCompletionList2.create = create;
      })(InlineCompletionList || (exports3.InlineCompletionList = InlineCompletionList = {}));
      var InlineCompletionTriggerKind;
      (function(InlineCompletionTriggerKind2) {
        InlineCompletionTriggerKind2.Invoked = 0;
        InlineCompletionTriggerKind2.Automatic = 1;
      })(InlineCompletionTriggerKind || (exports3.InlineCompletionTriggerKind = InlineCompletionTriggerKind = {}));
      var SelectedCompletionInfo;
      (function(SelectedCompletionInfo2) {
        function create(range, text) {
          return { range, text };
        }
        SelectedCompletionInfo2.create = create;
      })(SelectedCompletionInfo || (exports3.SelectedCompletionInfo = SelectedCompletionInfo = {}));
      var InlineCompletionContext;
      (function(InlineCompletionContext2) {
        function create(triggerKind, selectedCompletionInfo) {
          return { triggerKind, selectedCompletionInfo };
        }
        InlineCompletionContext2.create = create;
      })(InlineCompletionContext || (exports3.InlineCompletionContext = InlineCompletionContext = {}));
      var WorkspaceFolder;
      (function(WorkspaceFolder2) {
        function is(value) {
          var candidate = value;
          return Is.objectLiteral(candidate) && URI.is(candidate.uri) && Is.string(candidate.name);
        }
        WorkspaceFolder2.is = is;
      })(WorkspaceFolder || (exports3.WorkspaceFolder = WorkspaceFolder = {}));
      exports3.EOL = ["\n", "\r\n", "\r"];
      var TextDocument2;
      (function(TextDocument3) {
        function create(uri, languageId, version, content) {
          return new FullTextDocument2(uri, languageId, version, content);
        }
        TextDocument3.create = create;
        function is(value) {
          var candidate = value;
          return Is.defined(candidate) && Is.string(candidate.uri) && (Is.undefined(candidate.languageId) || Is.string(candidate.languageId)) && Is.uinteger(candidate.lineCount) && Is.func(candidate.getText) && Is.func(candidate.positionAt) && Is.func(candidate.offsetAt) ? true : false;
        }
        TextDocument3.is = is;
        function applyEdits(document, edits) {
          var text = document.getText();
          var sortedEdits = mergeSort2(edits, function(a, b) {
            var diff = a.range.start.line - b.range.start.line;
            if (diff === 0) {
              return a.range.start.character - b.range.start.character;
            }
            return diff;
          });
          var lastModifiedOffset = text.length;
          for (var i = sortedEdits.length - 1; i >= 0; i--) {
            var e = sortedEdits[i];
            var startOffset = document.offsetAt(e.range.start);
            var endOffset = document.offsetAt(e.range.end);
            if (endOffset <= lastModifiedOffset) {
              text = text.substring(0, startOffset) + e.newText + text.substring(endOffset, text.length);
            } else {
              throw new Error("Overlapping edit");
            }
            lastModifiedOffset = startOffset;
          }
          return text;
        }
        TextDocument3.applyEdits = applyEdits;
        function mergeSort2(data, compare) {
          if (data.length <= 1) {
            return data;
          }
          var p = data.length / 2 | 0;
          var left = data.slice(0, p);
          var right = data.slice(p);
          mergeSort2(left, compare);
          mergeSort2(right, compare);
          var leftIdx = 0;
          var rightIdx = 0;
          var i = 0;
          while (leftIdx < left.length && rightIdx < right.length) {
            var ret = compare(left[leftIdx], right[rightIdx]);
            if (ret <= 0) {
              data[i++] = left[leftIdx++];
            } else {
              data[i++] = right[rightIdx++];
            }
          }
          while (leftIdx < left.length) {
            data[i++] = left[leftIdx++];
          }
          while (rightIdx < right.length) {
            data[i++] = right[rightIdx++];
          }
          return data;
        }
      })(TextDocument2 || (exports3.TextDocument = TextDocument2 = {}));
      var FullTextDocument2 = (
        /** @class */
        (function() {
          function FullTextDocument3(uri, languageId, version, content) {
            this._uri = uri;
            this._languageId = languageId;
            this._version = version;
            this._content = content;
            this._lineOffsets = void 0;
          }
          Object.defineProperty(FullTextDocument3.prototype, "uri", {
            get: function() {
              return this._uri;
            },
            enumerable: false,
            configurable: true
          });
          Object.defineProperty(FullTextDocument3.prototype, "languageId", {
            get: function() {
              return this._languageId;
            },
            enumerable: false,
            configurable: true
          });
          Object.defineProperty(FullTextDocument3.prototype, "version", {
            get: function() {
              return this._version;
            },
            enumerable: false,
            configurable: true
          });
          FullTextDocument3.prototype.getText = function(range) {
            if (range) {
              var start = this.offsetAt(range.start);
              var end = this.offsetAt(range.end);
              return this._content.substring(start, end);
            }
            return this._content;
          };
          FullTextDocument3.prototype.update = function(event, version) {
            this._content = event.text;
            this._version = version;
            this._lineOffsets = void 0;
          };
          FullTextDocument3.prototype.getLineOffsets = function() {
            if (this._lineOffsets === void 0) {
              var lineOffsets = [];
              var text = this._content;
              var isLineStart = true;
              for (var i = 0; i < text.length; i++) {
                if (isLineStart) {
                  lineOffsets.push(i);
                  isLineStart = false;
                }
                var ch = text.charAt(i);
                isLineStart = ch === "\r" || ch === "\n";
                if (ch === "\r" && i + 1 < text.length && text.charAt(i + 1) === "\n") {
                  i++;
                }
              }
              if (isLineStart && text.length > 0) {
                lineOffsets.push(text.length);
              }
              this._lineOffsets = lineOffsets;
            }
            return this._lineOffsets;
          };
          FullTextDocument3.prototype.positionAt = function(offset) {
            offset = Math.max(Math.min(offset, this._content.length), 0);
            var lineOffsets = this.getLineOffsets();
            var low = 0, high = lineOffsets.length;
            if (high === 0) {
              return Position2.create(0, offset);
            }
            while (low < high) {
              var mid = Math.floor((low + high) / 2);
              if (lineOffsets[mid] > offset) {
                high = mid;
              } else {
                low = mid + 1;
              }
            }
            var line = low - 1;
            return Position2.create(line, offset - lineOffsets[line]);
          };
          FullTextDocument3.prototype.offsetAt = function(position) {
            var lineOffsets = this.getLineOffsets();
            if (position.line >= lineOffsets.length) {
              return this._content.length;
            } else if (position.line < 0) {
              return 0;
            }
            var lineOffset = lineOffsets[position.line];
            var nextLineOffset = position.line + 1 < lineOffsets.length ? lineOffsets[position.line + 1] : this._content.length;
            return Math.max(Math.min(lineOffset + position.character, nextLineOffset), lineOffset);
          };
          Object.defineProperty(FullTextDocument3.prototype, "lineCount", {
            get: function() {
              return this.getLineOffsets().length;
            },
            enumerable: false,
            configurable: true
          });
          return FullTextDocument3;
        })()
      );
      var Is;
      (function(Is2) {
        var toString = Object.prototype.toString;
        function defined(value) {
          return typeof value !== "undefined";
        }
        Is2.defined = defined;
        function undefined2(value) {
          return typeof value === "undefined";
        }
        Is2.undefined = undefined2;
        function boolean(value) {
          return value === true || value === false;
        }
        Is2.boolean = boolean;
        function string(value) {
          return toString.call(value) === "[object String]";
        }
        Is2.string = string;
        function number(value) {
          return toString.call(value) === "[object Number]";
        }
        Is2.number = number;
        function numberRange(value, min, max) {
          return toString.call(value) === "[object Number]" && min <= value && value <= max;
        }
        Is2.numberRange = numberRange;
        function integer2(value) {
          return toString.call(value) === "[object Number]" && -2147483648 <= value && value <= 2147483647;
        }
        Is2.integer = integer2;
        function uinteger2(value) {
          return toString.call(value) === "[object Number]" && 0 <= value && value <= 2147483647;
        }
        Is2.uinteger = uinteger2;
        function func(value) {
          return toString.call(value) === "[object Function]";
        }
        Is2.func = func;
        function objectLiteral(value) {
          return value !== null && typeof value === "object";
        }
        Is2.objectLiteral = objectLiteral;
        function typedArray(value, check) {
          return Array.isArray(value) && value.every(check);
        }
        Is2.typedArray = typedArray;
      })(Is || (Is = {}));
    });
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/messages.js
var require_messages2 = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/messages.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ProtocolNotificationType = exports2.ProtocolNotificationType0 = exports2.ProtocolRequestType = exports2.ProtocolRequestType0 = exports2.RegistrationType = exports2.MessageDirection = void 0;
    var vscode_jsonrpc_1 = require_main();
    var MessageDirection;
    (function(MessageDirection2) {
      MessageDirection2["clientToServer"] = "clientToServer";
      MessageDirection2["serverToClient"] = "serverToClient";
      MessageDirection2["both"] = "both";
    })(MessageDirection || (exports2.MessageDirection = MessageDirection = {}));
    var RegistrationType = class {
      constructor(method) {
        this.method = method;
      }
    };
    exports2.RegistrationType = RegistrationType;
    var ProtocolRequestType0 = class extends vscode_jsonrpc_1.RequestType0 {
      constructor(method) {
        super(method);
      }
    };
    exports2.ProtocolRequestType0 = ProtocolRequestType0;
    var ProtocolRequestType = class extends vscode_jsonrpc_1.RequestType {
      constructor(method) {
        super(method, vscode_jsonrpc_1.ParameterStructures.byName);
      }
    };
    exports2.ProtocolRequestType = ProtocolRequestType;
    var ProtocolNotificationType0 = class extends vscode_jsonrpc_1.NotificationType0 {
      constructor(method) {
        super(method);
      }
    };
    exports2.ProtocolNotificationType0 = ProtocolNotificationType0;
    var ProtocolNotificationType = class extends vscode_jsonrpc_1.NotificationType {
      constructor(method) {
        super(method, vscode_jsonrpc_1.ParameterStructures.byName);
      }
    };
    exports2.ProtocolNotificationType = ProtocolNotificationType;
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/utils/is.js
var require_is3 = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/utils/is.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.objectLiteral = exports2.typedArray = exports2.stringArray = exports2.array = exports2.func = exports2.error = exports2.number = exports2.string = exports2.boolean = void 0;
    function boolean(value) {
      return value === true || value === false;
    }
    exports2.boolean = boolean;
    function string(value) {
      return typeof value === "string" || value instanceof String;
    }
    exports2.string = string;
    function number(value) {
      return typeof value === "number" || value instanceof Number;
    }
    exports2.number = number;
    function error(value) {
      return value instanceof Error;
    }
    exports2.error = error;
    function func(value) {
      return typeof value === "function";
    }
    exports2.func = func;
    function array(value) {
      return Array.isArray(value);
    }
    exports2.array = array;
    function stringArray(value) {
      return array(value) && value.every((elem) => string(elem));
    }
    exports2.stringArray = stringArray;
    function typedArray(value, check) {
      return Array.isArray(value) && value.every(check);
    }
    exports2.typedArray = typedArray;
    function objectLiteral(value) {
      return value !== null && typeof value === "object";
    }
    exports2.objectLiteral = objectLiteral;
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.implementation.js
var require_protocol_implementation = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.implementation.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ImplementationRequest = void 0;
    var messages_1 = require_messages2();
    var ImplementationRequest;
    (function(ImplementationRequest2) {
      ImplementationRequest2.method = "textDocument/implementation";
      ImplementationRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      ImplementationRequest2.type = new messages_1.ProtocolRequestType(ImplementationRequest2.method);
    })(ImplementationRequest || (exports2.ImplementationRequest = ImplementationRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.typeDefinition.js
var require_protocol_typeDefinition = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.typeDefinition.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TypeDefinitionRequest = void 0;
    var messages_1 = require_messages2();
    var TypeDefinitionRequest;
    (function(TypeDefinitionRequest2) {
      TypeDefinitionRequest2.method = "textDocument/typeDefinition";
      TypeDefinitionRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      TypeDefinitionRequest2.type = new messages_1.ProtocolRequestType(TypeDefinitionRequest2.method);
    })(TypeDefinitionRequest || (exports2.TypeDefinitionRequest = TypeDefinitionRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.workspaceFolder.js
var require_protocol_workspaceFolder = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.workspaceFolder.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DidChangeWorkspaceFoldersNotification = exports2.WorkspaceFoldersRequest = void 0;
    var messages_1 = require_messages2();
    var WorkspaceFoldersRequest;
    (function(WorkspaceFoldersRequest2) {
      WorkspaceFoldersRequest2.method = "workspace/workspaceFolders";
      WorkspaceFoldersRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      WorkspaceFoldersRequest2.type = new messages_1.ProtocolRequestType0(WorkspaceFoldersRequest2.method);
    })(WorkspaceFoldersRequest || (exports2.WorkspaceFoldersRequest = WorkspaceFoldersRequest = {}));
    var DidChangeWorkspaceFoldersNotification;
    (function(DidChangeWorkspaceFoldersNotification2) {
      DidChangeWorkspaceFoldersNotification2.method = "workspace/didChangeWorkspaceFolders";
      DidChangeWorkspaceFoldersNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidChangeWorkspaceFoldersNotification2.type = new messages_1.ProtocolNotificationType(DidChangeWorkspaceFoldersNotification2.method);
    })(DidChangeWorkspaceFoldersNotification || (exports2.DidChangeWorkspaceFoldersNotification = DidChangeWorkspaceFoldersNotification = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.configuration.js
var require_protocol_configuration = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.configuration.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ConfigurationRequest = void 0;
    var messages_1 = require_messages2();
    var ConfigurationRequest;
    (function(ConfigurationRequest2) {
      ConfigurationRequest2.method = "workspace/configuration";
      ConfigurationRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      ConfigurationRequest2.type = new messages_1.ProtocolRequestType(ConfigurationRequest2.method);
    })(ConfigurationRequest || (exports2.ConfigurationRequest = ConfigurationRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.colorProvider.js
var require_protocol_colorProvider = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.colorProvider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ColorPresentationRequest = exports2.DocumentColorRequest = void 0;
    var messages_1 = require_messages2();
    var DocumentColorRequest;
    (function(DocumentColorRequest2) {
      DocumentColorRequest2.method = "textDocument/documentColor";
      DocumentColorRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentColorRequest2.type = new messages_1.ProtocolRequestType(DocumentColorRequest2.method);
    })(DocumentColorRequest || (exports2.DocumentColorRequest = DocumentColorRequest = {}));
    var ColorPresentationRequest;
    (function(ColorPresentationRequest2) {
      ColorPresentationRequest2.method = "textDocument/colorPresentation";
      ColorPresentationRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      ColorPresentationRequest2.type = new messages_1.ProtocolRequestType(ColorPresentationRequest2.method);
    })(ColorPresentationRequest || (exports2.ColorPresentationRequest = ColorPresentationRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.foldingRange.js
var require_protocol_foldingRange = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.foldingRange.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FoldingRangeRefreshRequest = exports2.FoldingRangeRequest = void 0;
    var messages_1 = require_messages2();
    var FoldingRangeRequest;
    (function(FoldingRangeRequest2) {
      FoldingRangeRequest2.method = "textDocument/foldingRange";
      FoldingRangeRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      FoldingRangeRequest2.type = new messages_1.ProtocolRequestType(FoldingRangeRequest2.method);
    })(FoldingRangeRequest || (exports2.FoldingRangeRequest = FoldingRangeRequest = {}));
    var FoldingRangeRefreshRequest;
    (function(FoldingRangeRefreshRequest2) {
      FoldingRangeRefreshRequest2.method = `workspace/foldingRange/refresh`;
      FoldingRangeRefreshRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      FoldingRangeRefreshRequest2.type = new messages_1.ProtocolRequestType0(FoldingRangeRefreshRequest2.method);
    })(FoldingRangeRefreshRequest || (exports2.FoldingRangeRefreshRequest = FoldingRangeRefreshRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.declaration.js
var require_protocol_declaration = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.declaration.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DeclarationRequest = void 0;
    var messages_1 = require_messages2();
    var DeclarationRequest;
    (function(DeclarationRequest2) {
      DeclarationRequest2.method = "textDocument/declaration";
      DeclarationRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DeclarationRequest2.type = new messages_1.ProtocolRequestType(DeclarationRequest2.method);
    })(DeclarationRequest || (exports2.DeclarationRequest = DeclarationRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.selectionRange.js
var require_protocol_selectionRange = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.selectionRange.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SelectionRangeRequest = void 0;
    var messages_1 = require_messages2();
    var SelectionRangeRequest;
    (function(SelectionRangeRequest2) {
      SelectionRangeRequest2.method = "textDocument/selectionRange";
      SelectionRangeRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      SelectionRangeRequest2.type = new messages_1.ProtocolRequestType(SelectionRangeRequest2.method);
    })(SelectionRangeRequest || (exports2.SelectionRangeRequest = SelectionRangeRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.progress.js
var require_protocol_progress = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.progress.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WorkDoneProgressCancelNotification = exports2.WorkDoneProgressCreateRequest = exports2.WorkDoneProgress = void 0;
    var vscode_jsonrpc_1 = require_main();
    var messages_1 = require_messages2();
    var WorkDoneProgress;
    (function(WorkDoneProgress2) {
      WorkDoneProgress2.type = new vscode_jsonrpc_1.ProgressType();
      function is(value) {
        return value === WorkDoneProgress2.type;
      }
      WorkDoneProgress2.is = is;
    })(WorkDoneProgress || (exports2.WorkDoneProgress = WorkDoneProgress = {}));
    var WorkDoneProgressCreateRequest;
    (function(WorkDoneProgressCreateRequest2) {
      WorkDoneProgressCreateRequest2.method = "window/workDoneProgress/create";
      WorkDoneProgressCreateRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      WorkDoneProgressCreateRequest2.type = new messages_1.ProtocolRequestType(WorkDoneProgressCreateRequest2.method);
    })(WorkDoneProgressCreateRequest || (exports2.WorkDoneProgressCreateRequest = WorkDoneProgressCreateRequest = {}));
    var WorkDoneProgressCancelNotification;
    (function(WorkDoneProgressCancelNotification2) {
      WorkDoneProgressCancelNotification2.method = "window/workDoneProgress/cancel";
      WorkDoneProgressCancelNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      WorkDoneProgressCancelNotification2.type = new messages_1.ProtocolNotificationType(WorkDoneProgressCancelNotification2.method);
    })(WorkDoneProgressCancelNotification || (exports2.WorkDoneProgressCancelNotification = WorkDoneProgressCancelNotification = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.callHierarchy.js
var require_protocol_callHierarchy = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.callHierarchy.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CallHierarchyOutgoingCallsRequest = exports2.CallHierarchyIncomingCallsRequest = exports2.CallHierarchyPrepareRequest = void 0;
    var messages_1 = require_messages2();
    var CallHierarchyPrepareRequest;
    (function(CallHierarchyPrepareRequest2) {
      CallHierarchyPrepareRequest2.method = "textDocument/prepareCallHierarchy";
      CallHierarchyPrepareRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CallHierarchyPrepareRequest2.type = new messages_1.ProtocolRequestType(CallHierarchyPrepareRequest2.method);
    })(CallHierarchyPrepareRequest || (exports2.CallHierarchyPrepareRequest = CallHierarchyPrepareRequest = {}));
    var CallHierarchyIncomingCallsRequest;
    (function(CallHierarchyIncomingCallsRequest2) {
      CallHierarchyIncomingCallsRequest2.method = "callHierarchy/incomingCalls";
      CallHierarchyIncomingCallsRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CallHierarchyIncomingCallsRequest2.type = new messages_1.ProtocolRequestType(CallHierarchyIncomingCallsRequest2.method);
    })(CallHierarchyIncomingCallsRequest || (exports2.CallHierarchyIncomingCallsRequest = CallHierarchyIncomingCallsRequest = {}));
    var CallHierarchyOutgoingCallsRequest;
    (function(CallHierarchyOutgoingCallsRequest2) {
      CallHierarchyOutgoingCallsRequest2.method = "callHierarchy/outgoingCalls";
      CallHierarchyOutgoingCallsRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CallHierarchyOutgoingCallsRequest2.type = new messages_1.ProtocolRequestType(CallHierarchyOutgoingCallsRequest2.method);
    })(CallHierarchyOutgoingCallsRequest || (exports2.CallHierarchyOutgoingCallsRequest = CallHierarchyOutgoingCallsRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.semanticTokens.js
var require_protocol_semanticTokens = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.semanticTokens.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SemanticTokensRefreshRequest = exports2.SemanticTokensRangeRequest = exports2.SemanticTokensDeltaRequest = exports2.SemanticTokensRequest = exports2.SemanticTokensRegistrationType = exports2.TokenFormat = void 0;
    var messages_1 = require_messages2();
    var TokenFormat;
    (function(TokenFormat2) {
      TokenFormat2.Relative = "relative";
    })(TokenFormat || (exports2.TokenFormat = TokenFormat = {}));
    var SemanticTokensRegistrationType;
    (function(SemanticTokensRegistrationType2) {
      SemanticTokensRegistrationType2.method = "textDocument/semanticTokens";
      SemanticTokensRegistrationType2.type = new messages_1.RegistrationType(SemanticTokensRegistrationType2.method);
    })(SemanticTokensRegistrationType || (exports2.SemanticTokensRegistrationType = SemanticTokensRegistrationType = {}));
    var SemanticTokensRequest;
    (function(SemanticTokensRequest2) {
      SemanticTokensRequest2.method = "textDocument/semanticTokens/full";
      SemanticTokensRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      SemanticTokensRequest2.type = new messages_1.ProtocolRequestType(SemanticTokensRequest2.method);
      SemanticTokensRequest2.registrationMethod = SemanticTokensRegistrationType.method;
    })(SemanticTokensRequest || (exports2.SemanticTokensRequest = SemanticTokensRequest = {}));
    var SemanticTokensDeltaRequest;
    (function(SemanticTokensDeltaRequest2) {
      SemanticTokensDeltaRequest2.method = "textDocument/semanticTokens/full/delta";
      SemanticTokensDeltaRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      SemanticTokensDeltaRequest2.type = new messages_1.ProtocolRequestType(SemanticTokensDeltaRequest2.method);
      SemanticTokensDeltaRequest2.registrationMethod = SemanticTokensRegistrationType.method;
    })(SemanticTokensDeltaRequest || (exports2.SemanticTokensDeltaRequest = SemanticTokensDeltaRequest = {}));
    var SemanticTokensRangeRequest;
    (function(SemanticTokensRangeRequest2) {
      SemanticTokensRangeRequest2.method = "textDocument/semanticTokens/range";
      SemanticTokensRangeRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      SemanticTokensRangeRequest2.type = new messages_1.ProtocolRequestType(SemanticTokensRangeRequest2.method);
      SemanticTokensRangeRequest2.registrationMethod = SemanticTokensRegistrationType.method;
    })(SemanticTokensRangeRequest || (exports2.SemanticTokensRangeRequest = SemanticTokensRangeRequest = {}));
    var SemanticTokensRefreshRequest;
    (function(SemanticTokensRefreshRequest2) {
      SemanticTokensRefreshRequest2.method = `workspace/semanticTokens/refresh`;
      SemanticTokensRefreshRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      SemanticTokensRefreshRequest2.type = new messages_1.ProtocolRequestType0(SemanticTokensRefreshRequest2.method);
    })(SemanticTokensRefreshRequest || (exports2.SemanticTokensRefreshRequest = SemanticTokensRefreshRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.showDocument.js
var require_protocol_showDocument = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.showDocument.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ShowDocumentRequest = void 0;
    var messages_1 = require_messages2();
    var ShowDocumentRequest;
    (function(ShowDocumentRequest2) {
      ShowDocumentRequest2.method = "window/showDocument";
      ShowDocumentRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      ShowDocumentRequest2.type = new messages_1.ProtocolRequestType(ShowDocumentRequest2.method);
    })(ShowDocumentRequest || (exports2.ShowDocumentRequest = ShowDocumentRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.linkedEditingRange.js
var require_protocol_linkedEditingRange = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.linkedEditingRange.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.LinkedEditingRangeRequest = void 0;
    var messages_1 = require_messages2();
    var LinkedEditingRangeRequest;
    (function(LinkedEditingRangeRequest2) {
      LinkedEditingRangeRequest2.method = "textDocument/linkedEditingRange";
      LinkedEditingRangeRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      LinkedEditingRangeRequest2.type = new messages_1.ProtocolRequestType(LinkedEditingRangeRequest2.method);
    })(LinkedEditingRangeRequest || (exports2.LinkedEditingRangeRequest = LinkedEditingRangeRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.fileOperations.js
var require_protocol_fileOperations = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.fileOperations.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WillDeleteFilesRequest = exports2.DidDeleteFilesNotification = exports2.DidRenameFilesNotification = exports2.WillRenameFilesRequest = exports2.DidCreateFilesNotification = exports2.WillCreateFilesRequest = exports2.FileOperationPatternKind = void 0;
    var messages_1 = require_messages2();
    var FileOperationPatternKind;
    (function(FileOperationPatternKind2) {
      FileOperationPatternKind2.file = "file";
      FileOperationPatternKind2.folder = "folder";
    })(FileOperationPatternKind || (exports2.FileOperationPatternKind = FileOperationPatternKind = {}));
    var WillCreateFilesRequest;
    (function(WillCreateFilesRequest2) {
      WillCreateFilesRequest2.method = "workspace/willCreateFiles";
      WillCreateFilesRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      WillCreateFilesRequest2.type = new messages_1.ProtocolRequestType(WillCreateFilesRequest2.method);
    })(WillCreateFilesRequest || (exports2.WillCreateFilesRequest = WillCreateFilesRequest = {}));
    var DidCreateFilesNotification;
    (function(DidCreateFilesNotification2) {
      DidCreateFilesNotification2.method = "workspace/didCreateFiles";
      DidCreateFilesNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidCreateFilesNotification2.type = new messages_1.ProtocolNotificationType(DidCreateFilesNotification2.method);
    })(DidCreateFilesNotification || (exports2.DidCreateFilesNotification = DidCreateFilesNotification = {}));
    var WillRenameFilesRequest;
    (function(WillRenameFilesRequest2) {
      WillRenameFilesRequest2.method = "workspace/willRenameFiles";
      WillRenameFilesRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      WillRenameFilesRequest2.type = new messages_1.ProtocolRequestType(WillRenameFilesRequest2.method);
    })(WillRenameFilesRequest || (exports2.WillRenameFilesRequest = WillRenameFilesRequest = {}));
    var DidRenameFilesNotification;
    (function(DidRenameFilesNotification2) {
      DidRenameFilesNotification2.method = "workspace/didRenameFiles";
      DidRenameFilesNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidRenameFilesNotification2.type = new messages_1.ProtocolNotificationType(DidRenameFilesNotification2.method);
    })(DidRenameFilesNotification || (exports2.DidRenameFilesNotification = DidRenameFilesNotification = {}));
    var DidDeleteFilesNotification;
    (function(DidDeleteFilesNotification2) {
      DidDeleteFilesNotification2.method = "workspace/didDeleteFiles";
      DidDeleteFilesNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidDeleteFilesNotification2.type = new messages_1.ProtocolNotificationType(DidDeleteFilesNotification2.method);
    })(DidDeleteFilesNotification || (exports2.DidDeleteFilesNotification = DidDeleteFilesNotification = {}));
    var WillDeleteFilesRequest;
    (function(WillDeleteFilesRequest2) {
      WillDeleteFilesRequest2.method = "workspace/willDeleteFiles";
      WillDeleteFilesRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      WillDeleteFilesRequest2.type = new messages_1.ProtocolRequestType(WillDeleteFilesRequest2.method);
    })(WillDeleteFilesRequest || (exports2.WillDeleteFilesRequest = WillDeleteFilesRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.moniker.js
var require_protocol_moniker = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.moniker.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MonikerRequest = exports2.MonikerKind = exports2.UniquenessLevel = void 0;
    var messages_1 = require_messages2();
    var UniquenessLevel;
    (function(UniquenessLevel2) {
      UniquenessLevel2.document = "document";
      UniquenessLevel2.project = "project";
      UniquenessLevel2.group = "group";
      UniquenessLevel2.scheme = "scheme";
      UniquenessLevel2.global = "global";
    })(UniquenessLevel || (exports2.UniquenessLevel = UniquenessLevel = {}));
    var MonikerKind;
    (function(MonikerKind2) {
      MonikerKind2.$import = "import";
      MonikerKind2.$export = "export";
      MonikerKind2.local = "local";
    })(MonikerKind || (exports2.MonikerKind = MonikerKind = {}));
    var MonikerRequest;
    (function(MonikerRequest2) {
      MonikerRequest2.method = "textDocument/moniker";
      MonikerRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      MonikerRequest2.type = new messages_1.ProtocolRequestType(MonikerRequest2.method);
    })(MonikerRequest || (exports2.MonikerRequest = MonikerRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.typeHierarchy.js
var require_protocol_typeHierarchy = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.typeHierarchy.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TypeHierarchySubtypesRequest = exports2.TypeHierarchySupertypesRequest = exports2.TypeHierarchyPrepareRequest = void 0;
    var messages_1 = require_messages2();
    var TypeHierarchyPrepareRequest;
    (function(TypeHierarchyPrepareRequest2) {
      TypeHierarchyPrepareRequest2.method = "textDocument/prepareTypeHierarchy";
      TypeHierarchyPrepareRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      TypeHierarchyPrepareRequest2.type = new messages_1.ProtocolRequestType(TypeHierarchyPrepareRequest2.method);
    })(TypeHierarchyPrepareRequest || (exports2.TypeHierarchyPrepareRequest = TypeHierarchyPrepareRequest = {}));
    var TypeHierarchySupertypesRequest;
    (function(TypeHierarchySupertypesRequest2) {
      TypeHierarchySupertypesRequest2.method = "typeHierarchy/supertypes";
      TypeHierarchySupertypesRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      TypeHierarchySupertypesRequest2.type = new messages_1.ProtocolRequestType(TypeHierarchySupertypesRequest2.method);
    })(TypeHierarchySupertypesRequest || (exports2.TypeHierarchySupertypesRequest = TypeHierarchySupertypesRequest = {}));
    var TypeHierarchySubtypesRequest;
    (function(TypeHierarchySubtypesRequest2) {
      TypeHierarchySubtypesRequest2.method = "typeHierarchy/subtypes";
      TypeHierarchySubtypesRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      TypeHierarchySubtypesRequest2.type = new messages_1.ProtocolRequestType(TypeHierarchySubtypesRequest2.method);
    })(TypeHierarchySubtypesRequest || (exports2.TypeHierarchySubtypesRequest = TypeHierarchySubtypesRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.inlineValue.js
var require_protocol_inlineValue = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.inlineValue.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.InlineValueRefreshRequest = exports2.InlineValueRequest = void 0;
    var messages_1 = require_messages2();
    var InlineValueRequest;
    (function(InlineValueRequest2) {
      InlineValueRequest2.method = "textDocument/inlineValue";
      InlineValueRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      InlineValueRequest2.type = new messages_1.ProtocolRequestType(InlineValueRequest2.method);
    })(InlineValueRequest || (exports2.InlineValueRequest = InlineValueRequest = {}));
    var InlineValueRefreshRequest;
    (function(InlineValueRefreshRequest2) {
      InlineValueRefreshRequest2.method = `workspace/inlineValue/refresh`;
      InlineValueRefreshRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      InlineValueRefreshRequest2.type = new messages_1.ProtocolRequestType0(InlineValueRefreshRequest2.method);
    })(InlineValueRefreshRequest || (exports2.InlineValueRefreshRequest = InlineValueRefreshRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.inlayHint.js
var require_protocol_inlayHint = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.inlayHint.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.InlayHintRefreshRequest = exports2.InlayHintResolveRequest = exports2.InlayHintRequest = void 0;
    var messages_1 = require_messages2();
    var InlayHintRequest;
    (function(InlayHintRequest2) {
      InlayHintRequest2.method = "textDocument/inlayHint";
      InlayHintRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      InlayHintRequest2.type = new messages_1.ProtocolRequestType(InlayHintRequest2.method);
    })(InlayHintRequest || (exports2.InlayHintRequest = InlayHintRequest = {}));
    var InlayHintResolveRequest;
    (function(InlayHintResolveRequest2) {
      InlayHintResolveRequest2.method = "inlayHint/resolve";
      InlayHintResolveRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      InlayHintResolveRequest2.type = new messages_1.ProtocolRequestType(InlayHintResolveRequest2.method);
    })(InlayHintResolveRequest || (exports2.InlayHintResolveRequest = InlayHintResolveRequest = {}));
    var InlayHintRefreshRequest;
    (function(InlayHintRefreshRequest2) {
      InlayHintRefreshRequest2.method = `workspace/inlayHint/refresh`;
      InlayHintRefreshRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      InlayHintRefreshRequest2.type = new messages_1.ProtocolRequestType0(InlayHintRefreshRequest2.method);
    })(InlayHintRefreshRequest || (exports2.InlayHintRefreshRequest = InlayHintRefreshRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.diagnostic.js
var require_protocol_diagnostic = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.diagnostic.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DiagnosticRefreshRequest = exports2.WorkspaceDiagnosticRequest = exports2.DocumentDiagnosticRequest = exports2.DocumentDiagnosticReportKind = exports2.DiagnosticServerCancellationData = void 0;
    var vscode_jsonrpc_1 = require_main();
    var Is = require_is3();
    var messages_1 = require_messages2();
    var DiagnosticServerCancellationData;
    (function(DiagnosticServerCancellationData2) {
      function is(value) {
        const candidate = value;
        return candidate && Is.boolean(candidate.retriggerRequest);
      }
      DiagnosticServerCancellationData2.is = is;
    })(DiagnosticServerCancellationData || (exports2.DiagnosticServerCancellationData = DiagnosticServerCancellationData = {}));
    var DocumentDiagnosticReportKind;
    (function(DocumentDiagnosticReportKind2) {
      DocumentDiagnosticReportKind2.Full = "full";
      DocumentDiagnosticReportKind2.Unchanged = "unchanged";
    })(DocumentDiagnosticReportKind || (exports2.DocumentDiagnosticReportKind = DocumentDiagnosticReportKind = {}));
    var DocumentDiagnosticRequest;
    (function(DocumentDiagnosticRequest2) {
      DocumentDiagnosticRequest2.method = "textDocument/diagnostic";
      DocumentDiagnosticRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentDiagnosticRequest2.type = new messages_1.ProtocolRequestType(DocumentDiagnosticRequest2.method);
      DocumentDiagnosticRequest2.partialResult = new vscode_jsonrpc_1.ProgressType();
    })(DocumentDiagnosticRequest || (exports2.DocumentDiagnosticRequest = DocumentDiagnosticRequest = {}));
    var WorkspaceDiagnosticRequest;
    (function(WorkspaceDiagnosticRequest2) {
      WorkspaceDiagnosticRequest2.method = "workspace/diagnostic";
      WorkspaceDiagnosticRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      WorkspaceDiagnosticRequest2.type = new messages_1.ProtocolRequestType(WorkspaceDiagnosticRequest2.method);
      WorkspaceDiagnosticRequest2.partialResult = new vscode_jsonrpc_1.ProgressType();
    })(WorkspaceDiagnosticRequest || (exports2.WorkspaceDiagnosticRequest = WorkspaceDiagnosticRequest = {}));
    var DiagnosticRefreshRequest;
    (function(DiagnosticRefreshRequest2) {
      DiagnosticRefreshRequest2.method = `workspace/diagnostic/refresh`;
      DiagnosticRefreshRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      DiagnosticRefreshRequest2.type = new messages_1.ProtocolRequestType0(DiagnosticRefreshRequest2.method);
    })(DiagnosticRefreshRequest || (exports2.DiagnosticRefreshRequest = DiagnosticRefreshRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.notebook.js
var require_protocol_notebook = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.notebook.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DidCloseNotebookDocumentNotification = exports2.DidSaveNotebookDocumentNotification = exports2.DidChangeNotebookDocumentNotification = exports2.NotebookCellArrayChange = exports2.DidOpenNotebookDocumentNotification = exports2.NotebookDocumentSyncRegistrationType = exports2.NotebookDocument = exports2.NotebookCell = exports2.ExecutionSummary = exports2.NotebookCellKind = void 0;
    var vscode_languageserver_types_1 = require_main2();
    var Is = require_is3();
    var messages_1 = require_messages2();
    var NotebookCellKind;
    (function(NotebookCellKind2) {
      NotebookCellKind2.Markup = 1;
      NotebookCellKind2.Code = 2;
      function is(value) {
        return value === 1 || value === 2;
      }
      NotebookCellKind2.is = is;
    })(NotebookCellKind || (exports2.NotebookCellKind = NotebookCellKind = {}));
    var ExecutionSummary;
    (function(ExecutionSummary2) {
      function create(executionOrder, success) {
        const result = { executionOrder };
        if (success === true || success === false) {
          result.success = success;
        }
        return result;
      }
      ExecutionSummary2.create = create;
      function is(value) {
        const candidate = value;
        return Is.objectLiteral(candidate) && vscode_languageserver_types_1.uinteger.is(candidate.executionOrder) && (candidate.success === void 0 || Is.boolean(candidate.success));
      }
      ExecutionSummary2.is = is;
      function equals(one, other) {
        if (one === other) {
          return true;
        }
        if (one === null || one === void 0 || other === null || other === void 0) {
          return false;
        }
        return one.executionOrder === other.executionOrder && one.success === other.success;
      }
      ExecutionSummary2.equals = equals;
    })(ExecutionSummary || (exports2.ExecutionSummary = ExecutionSummary = {}));
    var NotebookCell;
    (function(NotebookCell2) {
      function create(kind, document) {
        return { kind, document };
      }
      NotebookCell2.create = create;
      function is(value) {
        const candidate = value;
        return Is.objectLiteral(candidate) && NotebookCellKind.is(candidate.kind) && vscode_languageserver_types_1.DocumentUri.is(candidate.document) && (candidate.metadata === void 0 || Is.objectLiteral(candidate.metadata));
      }
      NotebookCell2.is = is;
      function diff(one, two) {
        const result = /* @__PURE__ */ new Set();
        if (one.document !== two.document) {
          result.add("document");
        }
        if (one.kind !== two.kind) {
          result.add("kind");
        }
        if (one.executionSummary !== two.executionSummary) {
          result.add("executionSummary");
        }
        if ((one.metadata !== void 0 || two.metadata !== void 0) && !equalsMetadata(one.metadata, two.metadata)) {
          result.add("metadata");
        }
        if ((one.executionSummary !== void 0 || two.executionSummary !== void 0) && !ExecutionSummary.equals(one.executionSummary, two.executionSummary)) {
          result.add("executionSummary");
        }
        return result;
      }
      NotebookCell2.diff = diff;
      function equalsMetadata(one, other) {
        if (one === other) {
          return true;
        }
        if (one === null || one === void 0 || other === null || other === void 0) {
          return false;
        }
        if (typeof one !== typeof other) {
          return false;
        }
        if (typeof one !== "object") {
          return false;
        }
        const oneArray = Array.isArray(one);
        const otherArray = Array.isArray(other);
        if (oneArray !== otherArray) {
          return false;
        }
        if (oneArray && otherArray) {
          if (one.length !== other.length) {
            return false;
          }
          for (let i = 0; i < one.length; i++) {
            if (!equalsMetadata(one[i], other[i])) {
              return false;
            }
          }
        }
        if (Is.objectLiteral(one) && Is.objectLiteral(other)) {
          const oneKeys = Object.keys(one);
          const otherKeys = Object.keys(other);
          if (oneKeys.length !== otherKeys.length) {
            return false;
          }
          oneKeys.sort();
          otherKeys.sort();
          if (!equalsMetadata(oneKeys, otherKeys)) {
            return false;
          }
          for (let i = 0; i < oneKeys.length; i++) {
            const prop = oneKeys[i];
            if (!equalsMetadata(one[prop], other[prop])) {
              return false;
            }
          }
        }
        return true;
      }
    })(NotebookCell || (exports2.NotebookCell = NotebookCell = {}));
    var NotebookDocument;
    (function(NotebookDocument2) {
      function create(uri, notebookType, version, cells) {
        return { uri, notebookType, version, cells };
      }
      NotebookDocument2.create = create;
      function is(value) {
        const candidate = value;
        return Is.objectLiteral(candidate) && Is.string(candidate.uri) && vscode_languageserver_types_1.integer.is(candidate.version) && Is.typedArray(candidate.cells, NotebookCell.is);
      }
      NotebookDocument2.is = is;
    })(NotebookDocument || (exports2.NotebookDocument = NotebookDocument = {}));
    var NotebookDocumentSyncRegistrationType;
    (function(NotebookDocumentSyncRegistrationType2) {
      NotebookDocumentSyncRegistrationType2.method = "notebookDocument/sync";
      NotebookDocumentSyncRegistrationType2.messageDirection = messages_1.MessageDirection.clientToServer;
      NotebookDocumentSyncRegistrationType2.type = new messages_1.RegistrationType(NotebookDocumentSyncRegistrationType2.method);
    })(NotebookDocumentSyncRegistrationType || (exports2.NotebookDocumentSyncRegistrationType = NotebookDocumentSyncRegistrationType = {}));
    var DidOpenNotebookDocumentNotification;
    (function(DidOpenNotebookDocumentNotification2) {
      DidOpenNotebookDocumentNotification2.method = "notebookDocument/didOpen";
      DidOpenNotebookDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidOpenNotebookDocumentNotification2.type = new messages_1.ProtocolNotificationType(DidOpenNotebookDocumentNotification2.method);
      DidOpenNotebookDocumentNotification2.registrationMethod = NotebookDocumentSyncRegistrationType.method;
    })(DidOpenNotebookDocumentNotification || (exports2.DidOpenNotebookDocumentNotification = DidOpenNotebookDocumentNotification = {}));
    var NotebookCellArrayChange;
    (function(NotebookCellArrayChange2) {
      function is(value) {
        const candidate = value;
        return Is.objectLiteral(candidate) && vscode_languageserver_types_1.uinteger.is(candidate.start) && vscode_languageserver_types_1.uinteger.is(candidate.deleteCount) && (candidate.cells === void 0 || Is.typedArray(candidate.cells, NotebookCell.is));
      }
      NotebookCellArrayChange2.is = is;
      function create(start, deleteCount, cells) {
        const result = { start, deleteCount };
        if (cells !== void 0) {
          result.cells = cells;
        }
        return result;
      }
      NotebookCellArrayChange2.create = create;
    })(NotebookCellArrayChange || (exports2.NotebookCellArrayChange = NotebookCellArrayChange = {}));
    var DidChangeNotebookDocumentNotification;
    (function(DidChangeNotebookDocumentNotification2) {
      DidChangeNotebookDocumentNotification2.method = "notebookDocument/didChange";
      DidChangeNotebookDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidChangeNotebookDocumentNotification2.type = new messages_1.ProtocolNotificationType(DidChangeNotebookDocumentNotification2.method);
      DidChangeNotebookDocumentNotification2.registrationMethod = NotebookDocumentSyncRegistrationType.method;
    })(DidChangeNotebookDocumentNotification || (exports2.DidChangeNotebookDocumentNotification = DidChangeNotebookDocumentNotification = {}));
    var DidSaveNotebookDocumentNotification;
    (function(DidSaveNotebookDocumentNotification2) {
      DidSaveNotebookDocumentNotification2.method = "notebookDocument/didSave";
      DidSaveNotebookDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidSaveNotebookDocumentNotification2.type = new messages_1.ProtocolNotificationType(DidSaveNotebookDocumentNotification2.method);
      DidSaveNotebookDocumentNotification2.registrationMethod = NotebookDocumentSyncRegistrationType.method;
    })(DidSaveNotebookDocumentNotification || (exports2.DidSaveNotebookDocumentNotification = DidSaveNotebookDocumentNotification = {}));
    var DidCloseNotebookDocumentNotification;
    (function(DidCloseNotebookDocumentNotification2) {
      DidCloseNotebookDocumentNotification2.method = "notebookDocument/didClose";
      DidCloseNotebookDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidCloseNotebookDocumentNotification2.type = new messages_1.ProtocolNotificationType(DidCloseNotebookDocumentNotification2.method);
      DidCloseNotebookDocumentNotification2.registrationMethod = NotebookDocumentSyncRegistrationType.method;
    })(DidCloseNotebookDocumentNotification || (exports2.DidCloseNotebookDocumentNotification = DidCloseNotebookDocumentNotification = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.inlineCompletion.js
var require_protocol_inlineCompletion = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.inlineCompletion.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.InlineCompletionRequest = void 0;
    var messages_1 = require_messages2();
    var InlineCompletionRequest;
    (function(InlineCompletionRequest2) {
      InlineCompletionRequest2.method = "textDocument/inlineCompletion";
      InlineCompletionRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      InlineCompletionRequest2.type = new messages_1.ProtocolRequestType(InlineCompletionRequest2.method);
    })(InlineCompletionRequest || (exports2.InlineCompletionRequest = InlineCompletionRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/protocol.js
var require_protocol = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/protocol.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WorkspaceSymbolRequest = exports2.CodeActionResolveRequest = exports2.CodeActionRequest = exports2.DocumentSymbolRequest = exports2.DocumentHighlightRequest = exports2.ReferencesRequest = exports2.DefinitionRequest = exports2.SignatureHelpRequest = exports2.SignatureHelpTriggerKind = exports2.HoverRequest = exports2.CompletionResolveRequest = exports2.CompletionRequest = exports2.CompletionTriggerKind = exports2.PublishDiagnosticsNotification = exports2.WatchKind = exports2.RelativePattern = exports2.FileChangeType = exports2.DidChangeWatchedFilesNotification = exports2.WillSaveTextDocumentWaitUntilRequest = exports2.WillSaveTextDocumentNotification = exports2.TextDocumentSaveReason = exports2.DidSaveTextDocumentNotification = exports2.DidCloseTextDocumentNotification = exports2.DidChangeTextDocumentNotification = exports2.TextDocumentContentChangeEvent = exports2.DidOpenTextDocumentNotification = exports2.TextDocumentSyncKind = exports2.TelemetryEventNotification = exports2.LogMessageNotification = exports2.ShowMessageRequest = exports2.ShowMessageNotification = exports2.MessageType = exports2.DidChangeConfigurationNotification = exports2.ExitNotification = exports2.ShutdownRequest = exports2.InitializedNotification = exports2.InitializeErrorCodes = exports2.InitializeRequest = exports2.WorkDoneProgressOptions = exports2.TextDocumentRegistrationOptions = exports2.StaticRegistrationOptions = exports2.PositionEncodingKind = exports2.FailureHandlingKind = exports2.ResourceOperationKind = exports2.UnregistrationRequest = exports2.RegistrationRequest = exports2.DocumentSelector = exports2.NotebookCellTextDocumentFilter = exports2.NotebookDocumentFilter = exports2.TextDocumentFilter = void 0;
    exports2.MonikerRequest = exports2.MonikerKind = exports2.UniquenessLevel = exports2.WillDeleteFilesRequest = exports2.DidDeleteFilesNotification = exports2.WillRenameFilesRequest = exports2.DidRenameFilesNotification = exports2.WillCreateFilesRequest = exports2.DidCreateFilesNotification = exports2.FileOperationPatternKind = exports2.LinkedEditingRangeRequest = exports2.ShowDocumentRequest = exports2.SemanticTokensRegistrationType = exports2.SemanticTokensRefreshRequest = exports2.SemanticTokensRangeRequest = exports2.SemanticTokensDeltaRequest = exports2.SemanticTokensRequest = exports2.TokenFormat = exports2.CallHierarchyPrepareRequest = exports2.CallHierarchyOutgoingCallsRequest = exports2.CallHierarchyIncomingCallsRequest = exports2.WorkDoneProgressCancelNotification = exports2.WorkDoneProgressCreateRequest = exports2.WorkDoneProgress = exports2.SelectionRangeRequest = exports2.DeclarationRequest = exports2.FoldingRangeRefreshRequest = exports2.FoldingRangeRequest = exports2.ColorPresentationRequest = exports2.DocumentColorRequest = exports2.ConfigurationRequest = exports2.DidChangeWorkspaceFoldersNotification = exports2.WorkspaceFoldersRequest = exports2.TypeDefinitionRequest = exports2.ImplementationRequest = exports2.ApplyWorkspaceEditRequest = exports2.ExecuteCommandRequest = exports2.PrepareRenameRequest = exports2.RenameRequest = exports2.PrepareSupportDefaultBehavior = exports2.DocumentOnTypeFormattingRequest = exports2.DocumentRangesFormattingRequest = exports2.DocumentRangeFormattingRequest = exports2.DocumentFormattingRequest = exports2.DocumentLinkResolveRequest = exports2.DocumentLinkRequest = exports2.CodeLensRefreshRequest = exports2.CodeLensResolveRequest = exports2.CodeLensRequest = exports2.WorkspaceSymbolResolveRequest = void 0;
    exports2.InlineCompletionRequest = exports2.DidCloseNotebookDocumentNotification = exports2.DidSaveNotebookDocumentNotification = exports2.DidChangeNotebookDocumentNotification = exports2.NotebookCellArrayChange = exports2.DidOpenNotebookDocumentNotification = exports2.NotebookDocumentSyncRegistrationType = exports2.NotebookDocument = exports2.NotebookCell = exports2.ExecutionSummary = exports2.NotebookCellKind = exports2.DiagnosticRefreshRequest = exports2.WorkspaceDiagnosticRequest = exports2.DocumentDiagnosticRequest = exports2.DocumentDiagnosticReportKind = exports2.DiagnosticServerCancellationData = exports2.InlayHintRefreshRequest = exports2.InlayHintResolveRequest = exports2.InlayHintRequest = exports2.InlineValueRefreshRequest = exports2.InlineValueRequest = exports2.TypeHierarchySupertypesRequest = exports2.TypeHierarchySubtypesRequest = exports2.TypeHierarchyPrepareRequest = void 0;
    var messages_1 = require_messages2();
    var vscode_languageserver_types_1 = require_main2();
    var Is = require_is3();
    var protocol_implementation_1 = require_protocol_implementation();
    Object.defineProperty(exports2, "ImplementationRequest", { enumerable: true, get: function() {
      return protocol_implementation_1.ImplementationRequest;
    } });
    var protocol_typeDefinition_1 = require_protocol_typeDefinition();
    Object.defineProperty(exports2, "TypeDefinitionRequest", { enumerable: true, get: function() {
      return protocol_typeDefinition_1.TypeDefinitionRequest;
    } });
    var protocol_workspaceFolder_1 = require_protocol_workspaceFolder();
    Object.defineProperty(exports2, "WorkspaceFoldersRequest", { enumerable: true, get: function() {
      return protocol_workspaceFolder_1.WorkspaceFoldersRequest;
    } });
    Object.defineProperty(exports2, "DidChangeWorkspaceFoldersNotification", { enumerable: true, get: function() {
      return protocol_workspaceFolder_1.DidChangeWorkspaceFoldersNotification;
    } });
    var protocol_configuration_1 = require_protocol_configuration();
    Object.defineProperty(exports2, "ConfigurationRequest", { enumerable: true, get: function() {
      return protocol_configuration_1.ConfigurationRequest;
    } });
    var protocol_colorProvider_1 = require_protocol_colorProvider();
    Object.defineProperty(exports2, "DocumentColorRequest", { enumerable: true, get: function() {
      return protocol_colorProvider_1.DocumentColorRequest;
    } });
    Object.defineProperty(exports2, "ColorPresentationRequest", { enumerable: true, get: function() {
      return protocol_colorProvider_1.ColorPresentationRequest;
    } });
    var protocol_foldingRange_1 = require_protocol_foldingRange();
    Object.defineProperty(exports2, "FoldingRangeRequest", { enumerable: true, get: function() {
      return protocol_foldingRange_1.FoldingRangeRequest;
    } });
    Object.defineProperty(exports2, "FoldingRangeRefreshRequest", { enumerable: true, get: function() {
      return protocol_foldingRange_1.FoldingRangeRefreshRequest;
    } });
    var protocol_declaration_1 = require_protocol_declaration();
    Object.defineProperty(exports2, "DeclarationRequest", { enumerable: true, get: function() {
      return protocol_declaration_1.DeclarationRequest;
    } });
    var protocol_selectionRange_1 = require_protocol_selectionRange();
    Object.defineProperty(exports2, "SelectionRangeRequest", { enumerable: true, get: function() {
      return protocol_selectionRange_1.SelectionRangeRequest;
    } });
    var protocol_progress_1 = require_protocol_progress();
    Object.defineProperty(exports2, "WorkDoneProgress", { enumerable: true, get: function() {
      return protocol_progress_1.WorkDoneProgress;
    } });
    Object.defineProperty(exports2, "WorkDoneProgressCreateRequest", { enumerable: true, get: function() {
      return protocol_progress_1.WorkDoneProgressCreateRequest;
    } });
    Object.defineProperty(exports2, "WorkDoneProgressCancelNotification", { enumerable: true, get: function() {
      return protocol_progress_1.WorkDoneProgressCancelNotification;
    } });
    var protocol_callHierarchy_1 = require_protocol_callHierarchy();
    Object.defineProperty(exports2, "CallHierarchyIncomingCallsRequest", { enumerable: true, get: function() {
      return protocol_callHierarchy_1.CallHierarchyIncomingCallsRequest;
    } });
    Object.defineProperty(exports2, "CallHierarchyOutgoingCallsRequest", { enumerable: true, get: function() {
      return protocol_callHierarchy_1.CallHierarchyOutgoingCallsRequest;
    } });
    Object.defineProperty(exports2, "CallHierarchyPrepareRequest", { enumerable: true, get: function() {
      return protocol_callHierarchy_1.CallHierarchyPrepareRequest;
    } });
    var protocol_semanticTokens_1 = require_protocol_semanticTokens();
    Object.defineProperty(exports2, "TokenFormat", { enumerable: true, get: function() {
      return protocol_semanticTokens_1.TokenFormat;
    } });
    Object.defineProperty(exports2, "SemanticTokensRequest", { enumerable: true, get: function() {
      return protocol_semanticTokens_1.SemanticTokensRequest;
    } });
    Object.defineProperty(exports2, "SemanticTokensDeltaRequest", { enumerable: true, get: function() {
      return protocol_semanticTokens_1.SemanticTokensDeltaRequest;
    } });
    Object.defineProperty(exports2, "SemanticTokensRangeRequest", { enumerable: true, get: function() {
      return protocol_semanticTokens_1.SemanticTokensRangeRequest;
    } });
    Object.defineProperty(exports2, "SemanticTokensRefreshRequest", { enumerable: true, get: function() {
      return protocol_semanticTokens_1.SemanticTokensRefreshRequest;
    } });
    Object.defineProperty(exports2, "SemanticTokensRegistrationType", { enumerable: true, get: function() {
      return protocol_semanticTokens_1.SemanticTokensRegistrationType;
    } });
    var protocol_showDocument_1 = require_protocol_showDocument();
    Object.defineProperty(exports2, "ShowDocumentRequest", { enumerable: true, get: function() {
      return protocol_showDocument_1.ShowDocumentRequest;
    } });
    var protocol_linkedEditingRange_1 = require_protocol_linkedEditingRange();
    Object.defineProperty(exports2, "LinkedEditingRangeRequest", { enumerable: true, get: function() {
      return protocol_linkedEditingRange_1.LinkedEditingRangeRequest;
    } });
    var protocol_fileOperations_1 = require_protocol_fileOperations();
    Object.defineProperty(exports2, "FileOperationPatternKind", { enumerable: true, get: function() {
      return protocol_fileOperations_1.FileOperationPatternKind;
    } });
    Object.defineProperty(exports2, "DidCreateFilesNotification", { enumerable: true, get: function() {
      return protocol_fileOperations_1.DidCreateFilesNotification;
    } });
    Object.defineProperty(exports2, "WillCreateFilesRequest", { enumerable: true, get: function() {
      return protocol_fileOperations_1.WillCreateFilesRequest;
    } });
    Object.defineProperty(exports2, "DidRenameFilesNotification", { enumerable: true, get: function() {
      return protocol_fileOperations_1.DidRenameFilesNotification;
    } });
    Object.defineProperty(exports2, "WillRenameFilesRequest", { enumerable: true, get: function() {
      return protocol_fileOperations_1.WillRenameFilesRequest;
    } });
    Object.defineProperty(exports2, "DidDeleteFilesNotification", { enumerable: true, get: function() {
      return protocol_fileOperations_1.DidDeleteFilesNotification;
    } });
    Object.defineProperty(exports2, "WillDeleteFilesRequest", { enumerable: true, get: function() {
      return protocol_fileOperations_1.WillDeleteFilesRequest;
    } });
    var protocol_moniker_1 = require_protocol_moniker();
    Object.defineProperty(exports2, "UniquenessLevel", { enumerable: true, get: function() {
      return protocol_moniker_1.UniquenessLevel;
    } });
    Object.defineProperty(exports2, "MonikerKind", { enumerable: true, get: function() {
      return protocol_moniker_1.MonikerKind;
    } });
    Object.defineProperty(exports2, "MonikerRequest", { enumerable: true, get: function() {
      return protocol_moniker_1.MonikerRequest;
    } });
    var protocol_typeHierarchy_1 = require_protocol_typeHierarchy();
    Object.defineProperty(exports2, "TypeHierarchyPrepareRequest", { enumerable: true, get: function() {
      return protocol_typeHierarchy_1.TypeHierarchyPrepareRequest;
    } });
    Object.defineProperty(exports2, "TypeHierarchySubtypesRequest", { enumerable: true, get: function() {
      return protocol_typeHierarchy_1.TypeHierarchySubtypesRequest;
    } });
    Object.defineProperty(exports2, "TypeHierarchySupertypesRequest", { enumerable: true, get: function() {
      return protocol_typeHierarchy_1.TypeHierarchySupertypesRequest;
    } });
    var protocol_inlineValue_1 = require_protocol_inlineValue();
    Object.defineProperty(exports2, "InlineValueRequest", { enumerable: true, get: function() {
      return protocol_inlineValue_1.InlineValueRequest;
    } });
    Object.defineProperty(exports2, "InlineValueRefreshRequest", { enumerable: true, get: function() {
      return protocol_inlineValue_1.InlineValueRefreshRequest;
    } });
    var protocol_inlayHint_1 = require_protocol_inlayHint();
    Object.defineProperty(exports2, "InlayHintRequest", { enumerable: true, get: function() {
      return protocol_inlayHint_1.InlayHintRequest;
    } });
    Object.defineProperty(exports2, "InlayHintResolveRequest", { enumerable: true, get: function() {
      return protocol_inlayHint_1.InlayHintResolveRequest;
    } });
    Object.defineProperty(exports2, "InlayHintRefreshRequest", { enumerable: true, get: function() {
      return protocol_inlayHint_1.InlayHintRefreshRequest;
    } });
    var protocol_diagnostic_1 = require_protocol_diagnostic();
    Object.defineProperty(exports2, "DiagnosticServerCancellationData", { enumerable: true, get: function() {
      return protocol_diagnostic_1.DiagnosticServerCancellationData;
    } });
    Object.defineProperty(exports2, "DocumentDiagnosticReportKind", { enumerable: true, get: function() {
      return protocol_diagnostic_1.DocumentDiagnosticReportKind;
    } });
    Object.defineProperty(exports2, "DocumentDiagnosticRequest", { enumerable: true, get: function() {
      return protocol_diagnostic_1.DocumentDiagnosticRequest;
    } });
    Object.defineProperty(exports2, "WorkspaceDiagnosticRequest", { enumerable: true, get: function() {
      return protocol_diagnostic_1.WorkspaceDiagnosticRequest;
    } });
    Object.defineProperty(exports2, "DiagnosticRefreshRequest", { enumerable: true, get: function() {
      return protocol_diagnostic_1.DiagnosticRefreshRequest;
    } });
    var protocol_notebook_1 = require_protocol_notebook();
    Object.defineProperty(exports2, "NotebookCellKind", { enumerable: true, get: function() {
      return protocol_notebook_1.NotebookCellKind;
    } });
    Object.defineProperty(exports2, "ExecutionSummary", { enumerable: true, get: function() {
      return protocol_notebook_1.ExecutionSummary;
    } });
    Object.defineProperty(exports2, "NotebookCell", { enumerable: true, get: function() {
      return protocol_notebook_1.NotebookCell;
    } });
    Object.defineProperty(exports2, "NotebookDocument", { enumerable: true, get: function() {
      return protocol_notebook_1.NotebookDocument;
    } });
    Object.defineProperty(exports2, "NotebookDocumentSyncRegistrationType", { enumerable: true, get: function() {
      return protocol_notebook_1.NotebookDocumentSyncRegistrationType;
    } });
    Object.defineProperty(exports2, "DidOpenNotebookDocumentNotification", { enumerable: true, get: function() {
      return protocol_notebook_1.DidOpenNotebookDocumentNotification;
    } });
    Object.defineProperty(exports2, "NotebookCellArrayChange", { enumerable: true, get: function() {
      return protocol_notebook_1.NotebookCellArrayChange;
    } });
    Object.defineProperty(exports2, "DidChangeNotebookDocumentNotification", { enumerable: true, get: function() {
      return protocol_notebook_1.DidChangeNotebookDocumentNotification;
    } });
    Object.defineProperty(exports2, "DidSaveNotebookDocumentNotification", { enumerable: true, get: function() {
      return protocol_notebook_1.DidSaveNotebookDocumentNotification;
    } });
    Object.defineProperty(exports2, "DidCloseNotebookDocumentNotification", { enumerable: true, get: function() {
      return protocol_notebook_1.DidCloseNotebookDocumentNotification;
    } });
    var protocol_inlineCompletion_1 = require_protocol_inlineCompletion();
    Object.defineProperty(exports2, "InlineCompletionRequest", { enumerable: true, get: function() {
      return protocol_inlineCompletion_1.InlineCompletionRequest;
    } });
    var TextDocumentFilter;
    (function(TextDocumentFilter2) {
      function is(value) {
        const candidate = value;
        return Is.string(candidate) || (Is.string(candidate.language) || Is.string(candidate.scheme) || Is.string(candidate.pattern));
      }
      TextDocumentFilter2.is = is;
    })(TextDocumentFilter || (exports2.TextDocumentFilter = TextDocumentFilter = {}));
    var NotebookDocumentFilter;
    (function(NotebookDocumentFilter2) {
      function is(value) {
        const candidate = value;
        return Is.objectLiteral(candidate) && (Is.string(candidate.notebookType) || Is.string(candidate.scheme) || Is.string(candidate.pattern));
      }
      NotebookDocumentFilter2.is = is;
    })(NotebookDocumentFilter || (exports2.NotebookDocumentFilter = NotebookDocumentFilter = {}));
    var NotebookCellTextDocumentFilter;
    (function(NotebookCellTextDocumentFilter2) {
      function is(value) {
        const candidate = value;
        return Is.objectLiteral(candidate) && (Is.string(candidate.notebook) || NotebookDocumentFilter.is(candidate.notebook)) && (candidate.language === void 0 || Is.string(candidate.language));
      }
      NotebookCellTextDocumentFilter2.is = is;
    })(NotebookCellTextDocumentFilter || (exports2.NotebookCellTextDocumentFilter = NotebookCellTextDocumentFilter = {}));
    var DocumentSelector;
    (function(DocumentSelector2) {
      function is(value) {
        if (!Array.isArray(value)) {
          return false;
        }
        for (let elem of value) {
          if (!Is.string(elem) && !TextDocumentFilter.is(elem) && !NotebookCellTextDocumentFilter.is(elem)) {
            return false;
          }
        }
        return true;
      }
      DocumentSelector2.is = is;
    })(DocumentSelector || (exports2.DocumentSelector = DocumentSelector = {}));
    var RegistrationRequest;
    (function(RegistrationRequest2) {
      RegistrationRequest2.method = "client/registerCapability";
      RegistrationRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      RegistrationRequest2.type = new messages_1.ProtocolRequestType(RegistrationRequest2.method);
    })(RegistrationRequest || (exports2.RegistrationRequest = RegistrationRequest = {}));
    var UnregistrationRequest;
    (function(UnregistrationRequest2) {
      UnregistrationRequest2.method = "client/unregisterCapability";
      UnregistrationRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      UnregistrationRequest2.type = new messages_1.ProtocolRequestType(UnregistrationRequest2.method);
    })(UnregistrationRequest || (exports2.UnregistrationRequest = UnregistrationRequest = {}));
    var ResourceOperationKind;
    (function(ResourceOperationKind2) {
      ResourceOperationKind2.Create = "create";
      ResourceOperationKind2.Rename = "rename";
      ResourceOperationKind2.Delete = "delete";
    })(ResourceOperationKind || (exports2.ResourceOperationKind = ResourceOperationKind = {}));
    var FailureHandlingKind;
    (function(FailureHandlingKind2) {
      FailureHandlingKind2.Abort = "abort";
      FailureHandlingKind2.Transactional = "transactional";
      FailureHandlingKind2.TextOnlyTransactional = "textOnlyTransactional";
      FailureHandlingKind2.Undo = "undo";
    })(FailureHandlingKind || (exports2.FailureHandlingKind = FailureHandlingKind = {}));
    var PositionEncodingKind;
    (function(PositionEncodingKind2) {
      PositionEncodingKind2.UTF8 = "utf-8";
      PositionEncodingKind2.UTF16 = "utf-16";
      PositionEncodingKind2.UTF32 = "utf-32";
    })(PositionEncodingKind || (exports2.PositionEncodingKind = PositionEncodingKind = {}));
    var StaticRegistrationOptions;
    (function(StaticRegistrationOptions2) {
      function hasId(value) {
        const candidate = value;
        return candidate && Is.string(candidate.id) && candidate.id.length > 0;
      }
      StaticRegistrationOptions2.hasId = hasId;
    })(StaticRegistrationOptions || (exports2.StaticRegistrationOptions = StaticRegistrationOptions = {}));
    var TextDocumentRegistrationOptions;
    (function(TextDocumentRegistrationOptions2) {
      function is(value) {
        const candidate = value;
        return candidate && (candidate.documentSelector === null || DocumentSelector.is(candidate.documentSelector));
      }
      TextDocumentRegistrationOptions2.is = is;
    })(TextDocumentRegistrationOptions || (exports2.TextDocumentRegistrationOptions = TextDocumentRegistrationOptions = {}));
    var WorkDoneProgressOptions;
    (function(WorkDoneProgressOptions2) {
      function is(value) {
        const candidate = value;
        return Is.objectLiteral(candidate) && (candidate.workDoneProgress === void 0 || Is.boolean(candidate.workDoneProgress));
      }
      WorkDoneProgressOptions2.is = is;
      function hasWorkDoneProgress(value) {
        const candidate = value;
        return candidate && Is.boolean(candidate.workDoneProgress);
      }
      WorkDoneProgressOptions2.hasWorkDoneProgress = hasWorkDoneProgress;
    })(WorkDoneProgressOptions || (exports2.WorkDoneProgressOptions = WorkDoneProgressOptions = {}));
    var InitializeRequest;
    (function(InitializeRequest2) {
      InitializeRequest2.method = "initialize";
      InitializeRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      InitializeRequest2.type = new messages_1.ProtocolRequestType(InitializeRequest2.method);
    })(InitializeRequest || (exports2.InitializeRequest = InitializeRequest = {}));
    var InitializeErrorCodes;
    (function(InitializeErrorCodes2) {
      InitializeErrorCodes2.unknownProtocolVersion = 1;
    })(InitializeErrorCodes || (exports2.InitializeErrorCodes = InitializeErrorCodes = {}));
    var InitializedNotification;
    (function(InitializedNotification2) {
      InitializedNotification2.method = "initialized";
      InitializedNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      InitializedNotification2.type = new messages_1.ProtocolNotificationType(InitializedNotification2.method);
    })(InitializedNotification || (exports2.InitializedNotification = InitializedNotification = {}));
    var ShutdownRequest;
    (function(ShutdownRequest2) {
      ShutdownRequest2.method = "shutdown";
      ShutdownRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      ShutdownRequest2.type = new messages_1.ProtocolRequestType0(ShutdownRequest2.method);
    })(ShutdownRequest || (exports2.ShutdownRequest = ShutdownRequest = {}));
    var ExitNotification;
    (function(ExitNotification2) {
      ExitNotification2.method = "exit";
      ExitNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      ExitNotification2.type = new messages_1.ProtocolNotificationType0(ExitNotification2.method);
    })(ExitNotification || (exports2.ExitNotification = ExitNotification = {}));
    var DidChangeConfigurationNotification;
    (function(DidChangeConfigurationNotification2) {
      DidChangeConfigurationNotification2.method = "workspace/didChangeConfiguration";
      DidChangeConfigurationNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidChangeConfigurationNotification2.type = new messages_1.ProtocolNotificationType(DidChangeConfigurationNotification2.method);
    })(DidChangeConfigurationNotification || (exports2.DidChangeConfigurationNotification = DidChangeConfigurationNotification = {}));
    var MessageType;
    (function(MessageType2) {
      MessageType2.Error = 1;
      MessageType2.Warning = 2;
      MessageType2.Info = 3;
      MessageType2.Log = 4;
      MessageType2.Debug = 5;
    })(MessageType || (exports2.MessageType = MessageType = {}));
    var ShowMessageNotification;
    (function(ShowMessageNotification2) {
      ShowMessageNotification2.method = "window/showMessage";
      ShowMessageNotification2.messageDirection = messages_1.MessageDirection.serverToClient;
      ShowMessageNotification2.type = new messages_1.ProtocolNotificationType(ShowMessageNotification2.method);
    })(ShowMessageNotification || (exports2.ShowMessageNotification = ShowMessageNotification = {}));
    var ShowMessageRequest;
    (function(ShowMessageRequest2) {
      ShowMessageRequest2.method = "window/showMessageRequest";
      ShowMessageRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      ShowMessageRequest2.type = new messages_1.ProtocolRequestType(ShowMessageRequest2.method);
    })(ShowMessageRequest || (exports2.ShowMessageRequest = ShowMessageRequest = {}));
    var LogMessageNotification;
    (function(LogMessageNotification2) {
      LogMessageNotification2.method = "window/logMessage";
      LogMessageNotification2.messageDirection = messages_1.MessageDirection.serverToClient;
      LogMessageNotification2.type = new messages_1.ProtocolNotificationType(LogMessageNotification2.method);
    })(LogMessageNotification || (exports2.LogMessageNotification = LogMessageNotification = {}));
    var TelemetryEventNotification;
    (function(TelemetryEventNotification2) {
      TelemetryEventNotification2.method = "telemetry/event";
      TelemetryEventNotification2.messageDirection = messages_1.MessageDirection.serverToClient;
      TelemetryEventNotification2.type = new messages_1.ProtocolNotificationType(TelemetryEventNotification2.method);
    })(TelemetryEventNotification || (exports2.TelemetryEventNotification = TelemetryEventNotification = {}));
    var TextDocumentSyncKind2;
    (function(TextDocumentSyncKind3) {
      TextDocumentSyncKind3.None = 0;
      TextDocumentSyncKind3.Full = 1;
      TextDocumentSyncKind3.Incremental = 2;
    })(TextDocumentSyncKind2 || (exports2.TextDocumentSyncKind = TextDocumentSyncKind2 = {}));
    var DidOpenTextDocumentNotification;
    (function(DidOpenTextDocumentNotification2) {
      DidOpenTextDocumentNotification2.method = "textDocument/didOpen";
      DidOpenTextDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidOpenTextDocumentNotification2.type = new messages_1.ProtocolNotificationType(DidOpenTextDocumentNotification2.method);
    })(DidOpenTextDocumentNotification || (exports2.DidOpenTextDocumentNotification = DidOpenTextDocumentNotification = {}));
    var TextDocumentContentChangeEvent;
    (function(TextDocumentContentChangeEvent2) {
      function isIncremental(event) {
        let candidate = event;
        return candidate !== void 0 && candidate !== null && typeof candidate.text === "string" && candidate.range !== void 0 && (candidate.rangeLength === void 0 || typeof candidate.rangeLength === "number");
      }
      TextDocumentContentChangeEvent2.isIncremental = isIncremental;
      function isFull(event) {
        let candidate = event;
        return candidate !== void 0 && candidate !== null && typeof candidate.text === "string" && candidate.range === void 0 && candidate.rangeLength === void 0;
      }
      TextDocumentContentChangeEvent2.isFull = isFull;
    })(TextDocumentContentChangeEvent || (exports2.TextDocumentContentChangeEvent = TextDocumentContentChangeEvent = {}));
    var DidChangeTextDocumentNotification;
    (function(DidChangeTextDocumentNotification2) {
      DidChangeTextDocumentNotification2.method = "textDocument/didChange";
      DidChangeTextDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidChangeTextDocumentNotification2.type = new messages_1.ProtocolNotificationType(DidChangeTextDocumentNotification2.method);
    })(DidChangeTextDocumentNotification || (exports2.DidChangeTextDocumentNotification = DidChangeTextDocumentNotification = {}));
    var DidCloseTextDocumentNotification;
    (function(DidCloseTextDocumentNotification2) {
      DidCloseTextDocumentNotification2.method = "textDocument/didClose";
      DidCloseTextDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidCloseTextDocumentNotification2.type = new messages_1.ProtocolNotificationType(DidCloseTextDocumentNotification2.method);
    })(DidCloseTextDocumentNotification || (exports2.DidCloseTextDocumentNotification = DidCloseTextDocumentNotification = {}));
    var DidSaveTextDocumentNotification;
    (function(DidSaveTextDocumentNotification2) {
      DidSaveTextDocumentNotification2.method = "textDocument/didSave";
      DidSaveTextDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidSaveTextDocumentNotification2.type = new messages_1.ProtocolNotificationType(DidSaveTextDocumentNotification2.method);
    })(DidSaveTextDocumentNotification || (exports2.DidSaveTextDocumentNotification = DidSaveTextDocumentNotification = {}));
    var TextDocumentSaveReason;
    (function(TextDocumentSaveReason2) {
      TextDocumentSaveReason2.Manual = 1;
      TextDocumentSaveReason2.AfterDelay = 2;
      TextDocumentSaveReason2.FocusOut = 3;
    })(TextDocumentSaveReason || (exports2.TextDocumentSaveReason = TextDocumentSaveReason = {}));
    var WillSaveTextDocumentNotification;
    (function(WillSaveTextDocumentNotification2) {
      WillSaveTextDocumentNotification2.method = "textDocument/willSave";
      WillSaveTextDocumentNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      WillSaveTextDocumentNotification2.type = new messages_1.ProtocolNotificationType(WillSaveTextDocumentNotification2.method);
    })(WillSaveTextDocumentNotification || (exports2.WillSaveTextDocumentNotification = WillSaveTextDocumentNotification = {}));
    var WillSaveTextDocumentWaitUntilRequest;
    (function(WillSaveTextDocumentWaitUntilRequest2) {
      WillSaveTextDocumentWaitUntilRequest2.method = "textDocument/willSaveWaitUntil";
      WillSaveTextDocumentWaitUntilRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      WillSaveTextDocumentWaitUntilRequest2.type = new messages_1.ProtocolRequestType(WillSaveTextDocumentWaitUntilRequest2.method);
    })(WillSaveTextDocumentWaitUntilRequest || (exports2.WillSaveTextDocumentWaitUntilRequest = WillSaveTextDocumentWaitUntilRequest = {}));
    var DidChangeWatchedFilesNotification;
    (function(DidChangeWatchedFilesNotification2) {
      DidChangeWatchedFilesNotification2.method = "workspace/didChangeWatchedFiles";
      DidChangeWatchedFilesNotification2.messageDirection = messages_1.MessageDirection.clientToServer;
      DidChangeWatchedFilesNotification2.type = new messages_1.ProtocolNotificationType(DidChangeWatchedFilesNotification2.method);
    })(DidChangeWatchedFilesNotification || (exports2.DidChangeWatchedFilesNotification = DidChangeWatchedFilesNotification = {}));
    var FileChangeType;
    (function(FileChangeType2) {
      FileChangeType2.Created = 1;
      FileChangeType2.Changed = 2;
      FileChangeType2.Deleted = 3;
    })(FileChangeType || (exports2.FileChangeType = FileChangeType = {}));
    var RelativePattern;
    (function(RelativePattern2) {
      function is(value) {
        const candidate = value;
        return Is.objectLiteral(candidate) && (vscode_languageserver_types_1.URI.is(candidate.baseUri) || vscode_languageserver_types_1.WorkspaceFolder.is(candidate.baseUri)) && Is.string(candidate.pattern);
      }
      RelativePattern2.is = is;
    })(RelativePattern || (exports2.RelativePattern = RelativePattern = {}));
    var WatchKind;
    (function(WatchKind2) {
      WatchKind2.Create = 1;
      WatchKind2.Change = 2;
      WatchKind2.Delete = 4;
    })(WatchKind || (exports2.WatchKind = WatchKind = {}));
    var PublishDiagnosticsNotification;
    (function(PublishDiagnosticsNotification2) {
      PublishDiagnosticsNotification2.method = "textDocument/publishDiagnostics";
      PublishDiagnosticsNotification2.messageDirection = messages_1.MessageDirection.serverToClient;
      PublishDiagnosticsNotification2.type = new messages_1.ProtocolNotificationType(PublishDiagnosticsNotification2.method);
    })(PublishDiagnosticsNotification || (exports2.PublishDiagnosticsNotification = PublishDiagnosticsNotification = {}));
    var CompletionTriggerKind;
    (function(CompletionTriggerKind2) {
      CompletionTriggerKind2.Invoked = 1;
      CompletionTriggerKind2.TriggerCharacter = 2;
      CompletionTriggerKind2.TriggerForIncompleteCompletions = 3;
    })(CompletionTriggerKind || (exports2.CompletionTriggerKind = CompletionTriggerKind = {}));
    var CompletionRequest;
    (function(CompletionRequest2) {
      CompletionRequest2.method = "textDocument/completion";
      CompletionRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CompletionRequest2.type = new messages_1.ProtocolRequestType(CompletionRequest2.method);
    })(CompletionRequest || (exports2.CompletionRequest = CompletionRequest = {}));
    var CompletionResolveRequest;
    (function(CompletionResolveRequest2) {
      CompletionResolveRequest2.method = "completionItem/resolve";
      CompletionResolveRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CompletionResolveRequest2.type = new messages_1.ProtocolRequestType(CompletionResolveRequest2.method);
    })(CompletionResolveRequest || (exports2.CompletionResolveRequest = CompletionResolveRequest = {}));
    var HoverRequest;
    (function(HoverRequest2) {
      HoverRequest2.method = "textDocument/hover";
      HoverRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      HoverRequest2.type = new messages_1.ProtocolRequestType(HoverRequest2.method);
    })(HoverRequest || (exports2.HoverRequest = HoverRequest = {}));
    var SignatureHelpTriggerKind;
    (function(SignatureHelpTriggerKind2) {
      SignatureHelpTriggerKind2.Invoked = 1;
      SignatureHelpTriggerKind2.TriggerCharacter = 2;
      SignatureHelpTriggerKind2.ContentChange = 3;
    })(SignatureHelpTriggerKind || (exports2.SignatureHelpTriggerKind = SignatureHelpTriggerKind = {}));
    var SignatureHelpRequest;
    (function(SignatureHelpRequest2) {
      SignatureHelpRequest2.method = "textDocument/signatureHelp";
      SignatureHelpRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      SignatureHelpRequest2.type = new messages_1.ProtocolRequestType(SignatureHelpRequest2.method);
    })(SignatureHelpRequest || (exports2.SignatureHelpRequest = SignatureHelpRequest = {}));
    var DefinitionRequest;
    (function(DefinitionRequest2) {
      DefinitionRequest2.method = "textDocument/definition";
      DefinitionRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DefinitionRequest2.type = new messages_1.ProtocolRequestType(DefinitionRequest2.method);
    })(DefinitionRequest || (exports2.DefinitionRequest = DefinitionRequest = {}));
    var ReferencesRequest;
    (function(ReferencesRequest2) {
      ReferencesRequest2.method = "textDocument/references";
      ReferencesRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      ReferencesRequest2.type = new messages_1.ProtocolRequestType(ReferencesRequest2.method);
    })(ReferencesRequest || (exports2.ReferencesRequest = ReferencesRequest = {}));
    var DocumentHighlightRequest;
    (function(DocumentHighlightRequest2) {
      DocumentHighlightRequest2.method = "textDocument/documentHighlight";
      DocumentHighlightRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentHighlightRequest2.type = new messages_1.ProtocolRequestType(DocumentHighlightRequest2.method);
    })(DocumentHighlightRequest || (exports2.DocumentHighlightRequest = DocumentHighlightRequest = {}));
    var DocumentSymbolRequest;
    (function(DocumentSymbolRequest2) {
      DocumentSymbolRequest2.method = "textDocument/documentSymbol";
      DocumentSymbolRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentSymbolRequest2.type = new messages_1.ProtocolRequestType(DocumentSymbolRequest2.method);
    })(DocumentSymbolRequest || (exports2.DocumentSymbolRequest = DocumentSymbolRequest = {}));
    var CodeActionRequest;
    (function(CodeActionRequest2) {
      CodeActionRequest2.method = "textDocument/codeAction";
      CodeActionRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CodeActionRequest2.type = new messages_1.ProtocolRequestType(CodeActionRequest2.method);
    })(CodeActionRequest || (exports2.CodeActionRequest = CodeActionRequest = {}));
    var CodeActionResolveRequest;
    (function(CodeActionResolveRequest2) {
      CodeActionResolveRequest2.method = "codeAction/resolve";
      CodeActionResolveRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CodeActionResolveRequest2.type = new messages_1.ProtocolRequestType(CodeActionResolveRequest2.method);
    })(CodeActionResolveRequest || (exports2.CodeActionResolveRequest = CodeActionResolveRequest = {}));
    var WorkspaceSymbolRequest;
    (function(WorkspaceSymbolRequest2) {
      WorkspaceSymbolRequest2.method = "workspace/symbol";
      WorkspaceSymbolRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      WorkspaceSymbolRequest2.type = new messages_1.ProtocolRequestType(WorkspaceSymbolRequest2.method);
    })(WorkspaceSymbolRequest || (exports2.WorkspaceSymbolRequest = WorkspaceSymbolRequest = {}));
    var WorkspaceSymbolResolveRequest;
    (function(WorkspaceSymbolResolveRequest2) {
      WorkspaceSymbolResolveRequest2.method = "workspaceSymbol/resolve";
      WorkspaceSymbolResolveRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      WorkspaceSymbolResolveRequest2.type = new messages_1.ProtocolRequestType(WorkspaceSymbolResolveRequest2.method);
    })(WorkspaceSymbolResolveRequest || (exports2.WorkspaceSymbolResolveRequest = WorkspaceSymbolResolveRequest = {}));
    var CodeLensRequest;
    (function(CodeLensRequest2) {
      CodeLensRequest2.method = "textDocument/codeLens";
      CodeLensRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CodeLensRequest2.type = new messages_1.ProtocolRequestType(CodeLensRequest2.method);
    })(CodeLensRequest || (exports2.CodeLensRequest = CodeLensRequest = {}));
    var CodeLensResolveRequest;
    (function(CodeLensResolveRequest2) {
      CodeLensResolveRequest2.method = "codeLens/resolve";
      CodeLensResolveRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      CodeLensResolveRequest2.type = new messages_1.ProtocolRequestType(CodeLensResolveRequest2.method);
    })(CodeLensResolveRequest || (exports2.CodeLensResolveRequest = CodeLensResolveRequest = {}));
    var CodeLensRefreshRequest;
    (function(CodeLensRefreshRequest2) {
      CodeLensRefreshRequest2.method = `workspace/codeLens/refresh`;
      CodeLensRefreshRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      CodeLensRefreshRequest2.type = new messages_1.ProtocolRequestType0(CodeLensRefreshRequest2.method);
    })(CodeLensRefreshRequest || (exports2.CodeLensRefreshRequest = CodeLensRefreshRequest = {}));
    var DocumentLinkRequest;
    (function(DocumentLinkRequest2) {
      DocumentLinkRequest2.method = "textDocument/documentLink";
      DocumentLinkRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentLinkRequest2.type = new messages_1.ProtocolRequestType(DocumentLinkRequest2.method);
    })(DocumentLinkRequest || (exports2.DocumentLinkRequest = DocumentLinkRequest = {}));
    var DocumentLinkResolveRequest;
    (function(DocumentLinkResolveRequest2) {
      DocumentLinkResolveRequest2.method = "documentLink/resolve";
      DocumentLinkResolveRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentLinkResolveRequest2.type = new messages_1.ProtocolRequestType(DocumentLinkResolveRequest2.method);
    })(DocumentLinkResolveRequest || (exports2.DocumentLinkResolveRequest = DocumentLinkResolveRequest = {}));
    var DocumentFormattingRequest;
    (function(DocumentFormattingRequest2) {
      DocumentFormattingRequest2.method = "textDocument/formatting";
      DocumentFormattingRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentFormattingRequest2.type = new messages_1.ProtocolRequestType(DocumentFormattingRequest2.method);
    })(DocumentFormattingRequest || (exports2.DocumentFormattingRequest = DocumentFormattingRequest = {}));
    var DocumentRangeFormattingRequest;
    (function(DocumentRangeFormattingRequest2) {
      DocumentRangeFormattingRequest2.method = "textDocument/rangeFormatting";
      DocumentRangeFormattingRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentRangeFormattingRequest2.type = new messages_1.ProtocolRequestType(DocumentRangeFormattingRequest2.method);
    })(DocumentRangeFormattingRequest || (exports2.DocumentRangeFormattingRequest = DocumentRangeFormattingRequest = {}));
    var DocumentRangesFormattingRequest;
    (function(DocumentRangesFormattingRequest2) {
      DocumentRangesFormattingRequest2.method = "textDocument/rangesFormatting";
      DocumentRangesFormattingRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentRangesFormattingRequest2.type = new messages_1.ProtocolRequestType(DocumentRangesFormattingRequest2.method);
    })(DocumentRangesFormattingRequest || (exports2.DocumentRangesFormattingRequest = DocumentRangesFormattingRequest = {}));
    var DocumentOnTypeFormattingRequest;
    (function(DocumentOnTypeFormattingRequest2) {
      DocumentOnTypeFormattingRequest2.method = "textDocument/onTypeFormatting";
      DocumentOnTypeFormattingRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      DocumentOnTypeFormattingRequest2.type = new messages_1.ProtocolRequestType(DocumentOnTypeFormattingRequest2.method);
    })(DocumentOnTypeFormattingRequest || (exports2.DocumentOnTypeFormattingRequest = DocumentOnTypeFormattingRequest = {}));
    var PrepareSupportDefaultBehavior;
    (function(PrepareSupportDefaultBehavior2) {
      PrepareSupportDefaultBehavior2.Identifier = 1;
    })(PrepareSupportDefaultBehavior || (exports2.PrepareSupportDefaultBehavior = PrepareSupportDefaultBehavior = {}));
    var RenameRequest;
    (function(RenameRequest2) {
      RenameRequest2.method = "textDocument/rename";
      RenameRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      RenameRequest2.type = new messages_1.ProtocolRequestType(RenameRequest2.method);
    })(RenameRequest || (exports2.RenameRequest = RenameRequest = {}));
    var PrepareRenameRequest;
    (function(PrepareRenameRequest2) {
      PrepareRenameRequest2.method = "textDocument/prepareRename";
      PrepareRenameRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      PrepareRenameRequest2.type = new messages_1.ProtocolRequestType(PrepareRenameRequest2.method);
    })(PrepareRenameRequest || (exports2.PrepareRenameRequest = PrepareRenameRequest = {}));
    var ExecuteCommandRequest;
    (function(ExecuteCommandRequest2) {
      ExecuteCommandRequest2.method = "workspace/executeCommand";
      ExecuteCommandRequest2.messageDirection = messages_1.MessageDirection.clientToServer;
      ExecuteCommandRequest2.type = new messages_1.ProtocolRequestType(ExecuteCommandRequest2.method);
    })(ExecuteCommandRequest || (exports2.ExecuteCommandRequest = ExecuteCommandRequest = {}));
    var ApplyWorkspaceEditRequest;
    (function(ApplyWorkspaceEditRequest2) {
      ApplyWorkspaceEditRequest2.method = "workspace/applyEdit";
      ApplyWorkspaceEditRequest2.messageDirection = messages_1.MessageDirection.serverToClient;
      ApplyWorkspaceEditRequest2.type = new messages_1.ProtocolRequestType("workspace/applyEdit");
    })(ApplyWorkspaceEditRequest || (exports2.ApplyWorkspaceEditRequest = ApplyWorkspaceEditRequest = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/connection.js
var require_connection2 = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/connection.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createProtocolConnection = void 0;
    var vscode_jsonrpc_1 = require_main();
    function createProtocolConnection(input, output, logger, options) {
      if (vscode_jsonrpc_1.ConnectionStrategy.is(options)) {
        options = { connectionStrategy: options };
      }
      return (0, vscode_jsonrpc_1.createMessageConnection)(input, output, logger, options);
    }
    exports2.createProtocolConnection = createProtocolConnection;
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/common/api.js
var require_api2 = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/common/api.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.LSPErrorCodes = exports2.createProtocolConnection = void 0;
    __exportStar(require_main(), exports2);
    __exportStar(require_main2(), exports2);
    __exportStar(require_messages2(), exports2);
    __exportStar(require_protocol(), exports2);
    var connection_1 = require_connection2();
    Object.defineProperty(exports2, "createProtocolConnection", { enumerable: true, get: function() {
      return connection_1.createProtocolConnection;
    } });
    var LSPErrorCodes;
    (function(LSPErrorCodes2) {
      LSPErrorCodes2.lspReservedErrorRangeStart = -32899;
      LSPErrorCodes2.RequestFailed = -32803;
      LSPErrorCodes2.ServerCancelled = -32802;
      LSPErrorCodes2.ContentModified = -32801;
      LSPErrorCodes2.RequestCancelled = -32800;
      LSPErrorCodes2.lspReservedErrorRangeEnd = -32800;
    })(LSPErrorCodes || (exports2.LSPErrorCodes = LSPErrorCodes = {}));
  }
});

// ../../node_modules/vscode-languageserver-protocol/lib/node/main.js
var require_main3 = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/lib/node/main.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createProtocolConnection = void 0;
    var node_1 = require_node();
    __exportStar(require_node(), exports2);
    __exportStar(require_api2(), exports2);
    function createProtocolConnection(input, output, logger, options) {
      return (0, node_1.createMessageConnection)(input, output, logger, options);
    }
    exports2.createProtocolConnection = createProtocolConnection;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/utils/uuid.js
var require_uuid = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/utils/uuid.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.generateUuid = exports2.parse = exports2.isUUID = exports2.v4 = exports2.empty = void 0;
    var ValueUUID = class {
      constructor(_value) {
        this._value = _value;
      }
      asHex() {
        return this._value;
      }
      equals(other) {
        return this.asHex() === other.asHex();
      }
    };
    var V4UUID = class _V4UUID extends ValueUUID {
      static _oneOf(array) {
        return array[Math.floor(array.length * Math.random())];
      }
      static _randomHex() {
        return _V4UUID._oneOf(_V4UUID._chars);
      }
      constructor() {
        super([
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          "-",
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          "-",
          "4",
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          "-",
          _V4UUID._oneOf(_V4UUID._timeHighBits),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          "-",
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex(),
          _V4UUID._randomHex()
        ].join(""));
      }
    };
    V4UUID._chars = ["0", "1", "2", "3", "4", "5", "6", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"];
    V4UUID._timeHighBits = ["8", "9", "a", "b"];
    exports2.empty = new ValueUUID("00000000-0000-0000-0000-000000000000");
    function v4() {
      return new V4UUID();
    }
    exports2.v4 = v4;
    var _UUIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    function isUUID(value) {
      return _UUIDPattern.test(value);
    }
    exports2.isUUID = isUUID;
    function parse(value) {
      if (!isUUID(value)) {
        throw new Error("invalid uuid");
      }
      return new ValueUUID(value);
    }
    exports2.parse = parse;
    function generateUuid() {
      return v4().asHex();
    }
    exports2.generateUuid = generateUuid;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/progress.js
var require_progress = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/progress.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.attachPartialResult = exports2.ProgressFeature = exports2.attachWorkDone = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var uuid_1 = require_uuid();
    var WorkDoneProgressReporterImpl = class _WorkDoneProgressReporterImpl {
      constructor(_connection, _token) {
        this._connection = _connection;
        this._token = _token;
        _WorkDoneProgressReporterImpl.Instances.set(this._token, this);
      }
      begin(title, percentage, message, cancellable) {
        let param = {
          kind: "begin",
          title,
          percentage,
          message,
          cancellable
        };
        this._connection.sendProgress(vscode_languageserver_protocol_1.WorkDoneProgress.type, this._token, param);
      }
      report(arg0, arg1) {
        let param = {
          kind: "report"
        };
        if (typeof arg0 === "number") {
          param.percentage = arg0;
          if (arg1 !== void 0) {
            param.message = arg1;
          }
        } else {
          param.message = arg0;
        }
        this._connection.sendProgress(vscode_languageserver_protocol_1.WorkDoneProgress.type, this._token, param);
      }
      done() {
        _WorkDoneProgressReporterImpl.Instances.delete(this._token);
        this._connection.sendProgress(vscode_languageserver_protocol_1.WorkDoneProgress.type, this._token, { kind: "end" });
      }
    };
    WorkDoneProgressReporterImpl.Instances = /* @__PURE__ */ new Map();
    var WorkDoneProgressServerReporterImpl = class extends WorkDoneProgressReporterImpl {
      constructor(connection2, token) {
        super(connection2, token);
        this._source = new vscode_languageserver_protocol_1.CancellationTokenSource();
      }
      get token() {
        return this._source.token;
      }
      done() {
        this._source.dispose();
        super.done();
      }
      cancel() {
        this._source.cancel();
      }
    };
    var NullProgressReporter = class {
      constructor() {
      }
      begin() {
      }
      report() {
      }
      done() {
      }
    };
    var NullProgressServerReporter = class extends NullProgressReporter {
      constructor() {
        super();
        this._source = new vscode_languageserver_protocol_1.CancellationTokenSource();
      }
      get token() {
        return this._source.token;
      }
      done() {
        this._source.dispose();
      }
      cancel() {
        this._source.cancel();
      }
    };
    function attachWorkDone(connection2, params) {
      if (params === void 0 || params.workDoneToken === void 0) {
        return new NullProgressReporter();
      }
      const token = params.workDoneToken;
      delete params.workDoneToken;
      return new WorkDoneProgressReporterImpl(connection2, token);
    }
    exports2.attachWorkDone = attachWorkDone;
    var ProgressFeature = (Base) => {
      return class extends Base {
        constructor() {
          super();
          this._progressSupported = false;
        }
        initialize(capabilities) {
          super.initialize(capabilities);
          if (capabilities?.window?.workDoneProgress === true) {
            this._progressSupported = true;
            this.connection.onNotification(vscode_languageserver_protocol_1.WorkDoneProgressCancelNotification.type, (params) => {
              let progress = WorkDoneProgressReporterImpl.Instances.get(params.token);
              if (progress instanceof WorkDoneProgressServerReporterImpl || progress instanceof NullProgressServerReporter) {
                progress.cancel();
              }
            });
          }
        }
        attachWorkDoneProgress(token) {
          if (token === void 0) {
            return new NullProgressReporter();
          } else {
            return new WorkDoneProgressReporterImpl(this.connection, token);
          }
        }
        createWorkDoneProgress() {
          if (this._progressSupported) {
            const token = (0, uuid_1.generateUuid)();
            return this.connection.sendRequest(vscode_languageserver_protocol_1.WorkDoneProgressCreateRequest.type, { token }).then(() => {
              const result = new WorkDoneProgressServerReporterImpl(this.connection, token);
              return result;
            });
          } else {
            return Promise.resolve(new NullProgressServerReporter());
          }
        }
      };
    };
    exports2.ProgressFeature = ProgressFeature;
    var ResultProgress;
    (function(ResultProgress2) {
      ResultProgress2.type = new vscode_languageserver_protocol_1.ProgressType();
    })(ResultProgress || (ResultProgress = {}));
    var ResultProgressReporterImpl = class {
      constructor(_connection, _token) {
        this._connection = _connection;
        this._token = _token;
      }
      report(data) {
        this._connection.sendProgress(ResultProgress.type, this._token, data);
      }
    };
    function attachPartialResult(connection2, params) {
      if (params === void 0 || params.partialResultToken === void 0) {
        return void 0;
      }
      const token = params.partialResultToken;
      delete params.partialResultToken;
      return new ResultProgressReporterImpl(connection2, token);
    }
    exports2.attachPartialResult = attachPartialResult;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/configuration.js
var require_configuration = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/configuration.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ConfigurationFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var Is = require_is();
    var ConfigurationFeature = (Base) => {
      return class extends Base {
        getConfiguration(arg) {
          if (!arg) {
            return this._getConfiguration({});
          } else if (Is.string(arg)) {
            return this._getConfiguration({ section: arg });
          } else {
            return this._getConfiguration(arg);
          }
        }
        _getConfiguration(arg) {
          let params = {
            items: Array.isArray(arg) ? arg : [arg]
          };
          return this.connection.sendRequest(vscode_languageserver_protocol_1.ConfigurationRequest.type, params).then((result) => {
            if (Array.isArray(result)) {
              return Array.isArray(arg) ? result : result[0];
            } else {
              return Array.isArray(arg) ? [] : null;
            }
          });
        }
      };
    };
    exports2.ConfigurationFeature = ConfigurationFeature;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/workspaceFolder.js
var require_workspaceFolder = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/workspaceFolder.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WorkspaceFoldersFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var WorkspaceFoldersFeature = (Base) => {
      return class extends Base {
        constructor() {
          super();
          this._notificationIsAutoRegistered = false;
        }
        initialize(capabilities) {
          super.initialize(capabilities);
          let workspaceCapabilities = capabilities.workspace;
          if (workspaceCapabilities && workspaceCapabilities.workspaceFolders) {
            this._onDidChangeWorkspaceFolders = new vscode_languageserver_protocol_1.Emitter();
            this.connection.onNotification(vscode_languageserver_protocol_1.DidChangeWorkspaceFoldersNotification.type, (params) => {
              this._onDidChangeWorkspaceFolders.fire(params.event);
            });
          }
        }
        fillServerCapabilities(capabilities) {
          super.fillServerCapabilities(capabilities);
          const changeNotifications = capabilities.workspace?.workspaceFolders?.changeNotifications;
          this._notificationIsAutoRegistered = changeNotifications === true || typeof changeNotifications === "string";
        }
        getWorkspaceFolders() {
          return this.connection.sendRequest(vscode_languageserver_protocol_1.WorkspaceFoldersRequest.type);
        }
        get onDidChangeWorkspaceFolders() {
          if (!this._onDidChangeWorkspaceFolders) {
            throw new Error("Client doesn't support sending workspace folder change events.");
          }
          if (!this._notificationIsAutoRegistered && !this._unregistration) {
            this._unregistration = this.connection.client.register(vscode_languageserver_protocol_1.DidChangeWorkspaceFoldersNotification.type);
          }
          return this._onDidChangeWorkspaceFolders.event;
        }
      };
    };
    exports2.WorkspaceFoldersFeature = WorkspaceFoldersFeature;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/callHierarchy.js
var require_callHierarchy = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/callHierarchy.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CallHierarchyFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var CallHierarchyFeature = (Base) => {
      return class extends Base {
        get callHierarchy() {
          return {
            onPrepare: (handler) => {
              return this.connection.onRequest(vscode_languageserver_protocol_1.CallHierarchyPrepareRequest.type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), void 0);
              });
            },
            onIncomingCalls: (handler) => {
              const type = vscode_languageserver_protocol_1.CallHierarchyIncomingCallsRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            },
            onOutgoingCalls: (handler) => {
              const type = vscode_languageserver_protocol_1.CallHierarchyOutgoingCallsRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            }
          };
        }
      };
    };
    exports2.CallHierarchyFeature = CallHierarchyFeature;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/semanticTokens.js
var require_semanticTokens = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/semanticTokens.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SemanticTokensBuilder = exports2.SemanticTokensDiff = exports2.SemanticTokensFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var SemanticTokensFeature = (Base) => {
      return class extends Base {
        get semanticTokens() {
          return {
            refresh: () => {
              return this.connection.sendRequest(vscode_languageserver_protocol_1.SemanticTokensRefreshRequest.type);
            },
            on: (handler) => {
              const type = vscode_languageserver_protocol_1.SemanticTokensRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            },
            onDelta: (handler) => {
              const type = vscode_languageserver_protocol_1.SemanticTokensDeltaRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            },
            onRange: (handler) => {
              const type = vscode_languageserver_protocol_1.SemanticTokensRangeRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            }
          };
        }
      };
    };
    exports2.SemanticTokensFeature = SemanticTokensFeature;
    var SemanticTokensDiff = class {
      constructor(originalSequence, modifiedSequence) {
        this.originalSequence = originalSequence;
        this.modifiedSequence = modifiedSequence;
      }
      computeDiff() {
        const originalLength = this.originalSequence.length;
        const modifiedLength = this.modifiedSequence.length;
        let startIndex = 0;
        while (startIndex < modifiedLength && startIndex < originalLength && this.originalSequence[startIndex] === this.modifiedSequence[startIndex]) {
          startIndex++;
        }
        if (startIndex < modifiedLength && startIndex < originalLength) {
          let originalEndIndex = originalLength - 1;
          let modifiedEndIndex = modifiedLength - 1;
          while (originalEndIndex >= startIndex && modifiedEndIndex >= startIndex && this.originalSequence[originalEndIndex] === this.modifiedSequence[modifiedEndIndex]) {
            originalEndIndex--;
            modifiedEndIndex--;
          }
          if (originalEndIndex < startIndex || modifiedEndIndex < startIndex) {
            originalEndIndex++;
            modifiedEndIndex++;
          }
          const deleteCount = originalEndIndex - startIndex + 1;
          const newData = this.modifiedSequence.slice(startIndex, modifiedEndIndex + 1);
          if (newData.length === 1 && newData[0] === this.originalSequence[originalEndIndex]) {
            return [
              { start: startIndex, deleteCount: deleteCount - 1 }
            ];
          } else {
            return [
              { start: startIndex, deleteCount, data: newData }
            ];
          }
        } else if (startIndex < modifiedLength) {
          return [
            { start: startIndex, deleteCount: 0, data: this.modifiedSequence.slice(startIndex) }
          ];
        } else if (startIndex < originalLength) {
          return [
            { start: startIndex, deleteCount: originalLength - startIndex }
          ];
        } else {
          return [];
        }
      }
    };
    exports2.SemanticTokensDiff = SemanticTokensDiff;
    var SemanticTokensBuilder = class {
      constructor() {
        this._prevData = void 0;
        this.initialize();
      }
      initialize() {
        this._id = Date.now();
        this._prevLine = 0;
        this._prevChar = 0;
        this._data = [];
        this._dataLen = 0;
      }
      push(line, char, length, tokenType, tokenModifiers) {
        let pushLine = line;
        let pushChar = char;
        if (this._dataLen > 0) {
          pushLine -= this._prevLine;
          if (pushLine === 0) {
            pushChar -= this._prevChar;
          }
        }
        this._data[this._dataLen++] = pushLine;
        this._data[this._dataLen++] = pushChar;
        this._data[this._dataLen++] = length;
        this._data[this._dataLen++] = tokenType;
        this._data[this._dataLen++] = tokenModifiers;
        this._prevLine = line;
        this._prevChar = char;
      }
      get id() {
        return this._id.toString();
      }
      previousResult(id) {
        if (this.id === id) {
          this._prevData = this._data;
        }
        this.initialize();
      }
      build() {
        this._prevData = void 0;
        return {
          resultId: this.id,
          data: this._data
        };
      }
      canBuildEdits() {
        return this._prevData !== void 0;
      }
      buildEdits() {
        if (this._prevData !== void 0) {
          return {
            resultId: this.id,
            edits: new SemanticTokensDiff(this._prevData, this._data).computeDiff()
          };
        } else {
          return this.build();
        }
      }
    };
    exports2.SemanticTokensBuilder = SemanticTokensBuilder;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/showDocument.js
var require_showDocument = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/showDocument.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ShowDocumentFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var ShowDocumentFeature = (Base) => {
      return class extends Base {
        showDocument(params) {
          return this.connection.sendRequest(vscode_languageserver_protocol_1.ShowDocumentRequest.type, params);
        }
      };
    };
    exports2.ShowDocumentFeature = ShowDocumentFeature;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/fileOperations.js
var require_fileOperations = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/fileOperations.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FileOperationsFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var FileOperationsFeature = (Base) => {
      return class extends Base {
        onDidCreateFiles(handler) {
          return this.connection.onNotification(vscode_languageserver_protocol_1.DidCreateFilesNotification.type, (params) => {
            handler(params);
          });
        }
        onDidRenameFiles(handler) {
          return this.connection.onNotification(vscode_languageserver_protocol_1.DidRenameFilesNotification.type, (params) => {
            handler(params);
          });
        }
        onDidDeleteFiles(handler) {
          return this.connection.onNotification(vscode_languageserver_protocol_1.DidDeleteFilesNotification.type, (params) => {
            handler(params);
          });
        }
        onWillCreateFiles(handler) {
          return this.connection.onRequest(vscode_languageserver_protocol_1.WillCreateFilesRequest.type, (params, cancel) => {
            return handler(params, cancel);
          });
        }
        onWillRenameFiles(handler) {
          return this.connection.onRequest(vscode_languageserver_protocol_1.WillRenameFilesRequest.type, (params, cancel) => {
            return handler(params, cancel);
          });
        }
        onWillDeleteFiles(handler) {
          return this.connection.onRequest(vscode_languageserver_protocol_1.WillDeleteFilesRequest.type, (params, cancel) => {
            return handler(params, cancel);
          });
        }
      };
    };
    exports2.FileOperationsFeature = FileOperationsFeature;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/linkedEditingRange.js
var require_linkedEditingRange = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/linkedEditingRange.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.LinkedEditingRangeFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var LinkedEditingRangeFeature = (Base) => {
      return class extends Base {
        onLinkedEditingRange(handler) {
          return this.connection.onRequest(vscode_languageserver_protocol_1.LinkedEditingRangeRequest.type, (params, cancel) => {
            return handler(params, cancel, this.attachWorkDoneProgress(params), void 0);
          });
        }
      };
    };
    exports2.LinkedEditingRangeFeature = LinkedEditingRangeFeature;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/typeHierarchy.js
var require_typeHierarchy = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/typeHierarchy.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TypeHierarchyFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var TypeHierarchyFeature = (Base) => {
      return class extends Base {
        get typeHierarchy() {
          return {
            onPrepare: (handler) => {
              return this.connection.onRequest(vscode_languageserver_protocol_1.TypeHierarchyPrepareRequest.type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), void 0);
              });
            },
            onSupertypes: (handler) => {
              const type = vscode_languageserver_protocol_1.TypeHierarchySupertypesRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            },
            onSubtypes: (handler) => {
              const type = vscode_languageserver_protocol_1.TypeHierarchySubtypesRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            }
          };
        }
      };
    };
    exports2.TypeHierarchyFeature = TypeHierarchyFeature;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/inlineValue.js
var require_inlineValue = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/inlineValue.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.InlineValueFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var InlineValueFeature = (Base) => {
      return class extends Base {
        get inlineValue() {
          return {
            refresh: () => {
              return this.connection.sendRequest(vscode_languageserver_protocol_1.InlineValueRefreshRequest.type);
            },
            on: (handler) => {
              return this.connection.onRequest(vscode_languageserver_protocol_1.InlineValueRequest.type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params));
              });
            }
          };
        }
      };
    };
    exports2.InlineValueFeature = InlineValueFeature;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/foldingRange.js
var require_foldingRange = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/foldingRange.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.FoldingRangeFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var FoldingRangeFeature = (Base) => {
      return class extends Base {
        get foldingRange() {
          return {
            refresh: () => {
              return this.connection.sendRequest(vscode_languageserver_protocol_1.FoldingRangeRefreshRequest.type);
            },
            on: (handler) => {
              const type = vscode_languageserver_protocol_1.FoldingRangeRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            }
          };
        }
      };
    };
    exports2.FoldingRangeFeature = FoldingRangeFeature;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/inlayHint.js
var require_inlayHint = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/inlayHint.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.InlayHintFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var InlayHintFeature = (Base) => {
      return class extends Base {
        get inlayHint() {
          return {
            refresh: () => {
              return this.connection.sendRequest(vscode_languageserver_protocol_1.InlayHintRefreshRequest.type);
            },
            on: (handler) => {
              return this.connection.onRequest(vscode_languageserver_protocol_1.InlayHintRequest.type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params));
              });
            },
            resolve: (handler) => {
              return this.connection.onRequest(vscode_languageserver_protocol_1.InlayHintResolveRequest.type, (params, cancel) => {
                return handler(params, cancel);
              });
            }
          };
        }
      };
    };
    exports2.InlayHintFeature = InlayHintFeature;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/diagnostic.js
var require_diagnostic = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/diagnostic.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DiagnosticFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var DiagnosticFeature = (Base) => {
      return class extends Base {
        get diagnostics() {
          return {
            refresh: () => {
              return this.connection.sendRequest(vscode_languageserver_protocol_1.DiagnosticRefreshRequest.type);
            },
            on: (handler) => {
              return this.connection.onRequest(vscode_languageserver_protocol_1.DocumentDiagnosticRequest.type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(vscode_languageserver_protocol_1.DocumentDiagnosticRequest.partialResult, params));
              });
            },
            onWorkspace: (handler) => {
              return this.connection.onRequest(vscode_languageserver_protocol_1.WorkspaceDiagnosticRequest.type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(vscode_languageserver_protocol_1.WorkspaceDiagnosticRequest.partialResult, params));
              });
            }
          };
        }
      };
    };
    exports2.DiagnosticFeature = DiagnosticFeature;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/textDocuments.js
var require_textDocuments = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/textDocuments.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.TextDocuments = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var TextDocuments2 = class {
      /**
       * Create a new text document manager.
       */
      constructor(configuration) {
        this._configuration = configuration;
        this._syncedDocuments = /* @__PURE__ */ new Map();
        this._onDidChangeContent = new vscode_languageserver_protocol_1.Emitter();
        this._onDidOpen = new vscode_languageserver_protocol_1.Emitter();
        this._onDidClose = new vscode_languageserver_protocol_1.Emitter();
        this._onDidSave = new vscode_languageserver_protocol_1.Emitter();
        this._onWillSave = new vscode_languageserver_protocol_1.Emitter();
      }
      /**
       * An event that fires when a text document managed by this manager
       * has been opened.
       */
      get onDidOpen() {
        return this._onDidOpen.event;
      }
      /**
       * An event that fires when a text document managed by this manager
       * has been opened or the content changes.
       */
      get onDidChangeContent() {
        return this._onDidChangeContent.event;
      }
      /**
       * An event that fires when a text document managed by this manager
       * will be saved.
       */
      get onWillSave() {
        return this._onWillSave.event;
      }
      /**
       * Sets a handler that will be called if a participant wants to provide
       * edits during a text document save.
       */
      onWillSaveWaitUntil(handler) {
        this._willSaveWaitUntil = handler;
      }
      /**
       * An event that fires when a text document managed by this manager
       * has been saved.
       */
      get onDidSave() {
        return this._onDidSave.event;
      }
      /**
       * An event that fires when a text document managed by this manager
       * has been closed.
       */
      get onDidClose() {
        return this._onDidClose.event;
      }
      /**
       * Returns the document for the given URI. Returns undefined if
       * the document is not managed by this instance.
       *
       * @param uri The text document's URI to retrieve.
       * @return the text document or `undefined`.
       */
      get(uri) {
        return this._syncedDocuments.get(uri);
      }
      /**
       * Returns all text documents managed by this instance.
       *
       * @return all text documents.
       */
      all() {
        return Array.from(this._syncedDocuments.values());
      }
      /**
       * Returns the URIs of all text documents managed by this instance.
       *
       * @return the URI's of all text documents.
       */
      keys() {
        return Array.from(this._syncedDocuments.keys());
      }
      /**
       * Listens for `low level` notification on the given connection to
       * update the text documents managed by this instance.
       *
       * Please note that the connection only provides handlers not an event model. Therefore
       * listening on a connection will overwrite the following handlers on a connection:
       * `onDidOpenTextDocument`, `onDidChangeTextDocument`, `onDidCloseTextDocument`,
       * `onWillSaveTextDocument`, `onWillSaveTextDocumentWaitUntil` and `onDidSaveTextDocument`.
       *
       * Use the corresponding events on the TextDocuments instance instead.
       *
       * @param connection The connection to listen on.
       */
      listen(connection2) {
        connection2.__textDocumentSync = vscode_languageserver_protocol_1.TextDocumentSyncKind.Incremental;
        const disposables = [];
        disposables.push(connection2.onDidOpenTextDocument((event) => {
          const td = event.textDocument;
          const document = this._configuration.create(td.uri, td.languageId, td.version, td.text);
          this._syncedDocuments.set(td.uri, document);
          const toFire = Object.freeze({ document });
          this._onDidOpen.fire(toFire);
          this._onDidChangeContent.fire(toFire);
        }));
        disposables.push(connection2.onDidChangeTextDocument((event) => {
          const td = event.textDocument;
          const changes = event.contentChanges;
          if (changes.length === 0) {
            return;
          }
          const { version } = td;
          if (version === null || version === void 0) {
            throw new Error(`Received document change event for ${td.uri} without valid version identifier`);
          }
          let syncedDocument = this._syncedDocuments.get(td.uri);
          if (syncedDocument !== void 0) {
            syncedDocument = this._configuration.update(syncedDocument, changes, version);
            this._syncedDocuments.set(td.uri, syncedDocument);
            this._onDidChangeContent.fire(Object.freeze({ document: syncedDocument }));
          }
        }));
        disposables.push(connection2.onDidCloseTextDocument((event) => {
          let syncedDocument = this._syncedDocuments.get(event.textDocument.uri);
          if (syncedDocument !== void 0) {
            this._syncedDocuments.delete(event.textDocument.uri);
            this._onDidClose.fire(Object.freeze({ document: syncedDocument }));
          }
        }));
        disposables.push(connection2.onWillSaveTextDocument((event) => {
          let syncedDocument = this._syncedDocuments.get(event.textDocument.uri);
          if (syncedDocument !== void 0) {
            this._onWillSave.fire(Object.freeze({ document: syncedDocument, reason: event.reason }));
          }
        }));
        disposables.push(connection2.onWillSaveTextDocumentWaitUntil((event, token) => {
          let syncedDocument = this._syncedDocuments.get(event.textDocument.uri);
          if (syncedDocument !== void 0 && this._willSaveWaitUntil) {
            return this._willSaveWaitUntil(Object.freeze({ document: syncedDocument, reason: event.reason }), token);
          } else {
            return [];
          }
        }));
        disposables.push(connection2.onDidSaveTextDocument((event) => {
          let syncedDocument = this._syncedDocuments.get(event.textDocument.uri);
          if (syncedDocument !== void 0) {
            this._onDidSave.fire(Object.freeze({ document: syncedDocument }));
          }
        }));
        return vscode_languageserver_protocol_1.Disposable.create(() => {
          disposables.forEach((disposable) => disposable.dispose());
        });
      }
    };
    exports2.TextDocuments = TextDocuments2;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/notebook.js
var require_notebook = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/notebook.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.NotebookDocuments = exports2.NotebookSyncFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var textDocuments_1 = require_textDocuments();
    var NotebookSyncFeature = (Base) => {
      return class extends Base {
        get synchronization() {
          return {
            onDidOpenNotebookDocument: (handler) => {
              return this.connection.onNotification(vscode_languageserver_protocol_1.DidOpenNotebookDocumentNotification.type, (params) => {
                handler(params);
              });
            },
            onDidChangeNotebookDocument: (handler) => {
              return this.connection.onNotification(vscode_languageserver_protocol_1.DidChangeNotebookDocumentNotification.type, (params) => {
                handler(params);
              });
            },
            onDidSaveNotebookDocument: (handler) => {
              return this.connection.onNotification(vscode_languageserver_protocol_1.DidSaveNotebookDocumentNotification.type, (params) => {
                handler(params);
              });
            },
            onDidCloseNotebookDocument: (handler) => {
              return this.connection.onNotification(vscode_languageserver_protocol_1.DidCloseNotebookDocumentNotification.type, (params) => {
                handler(params);
              });
            }
          };
        }
      };
    };
    exports2.NotebookSyncFeature = NotebookSyncFeature;
    var CellTextDocumentConnection = class _CellTextDocumentConnection {
      onDidOpenTextDocument(handler) {
        this.openHandler = handler;
        return vscode_languageserver_protocol_1.Disposable.create(() => {
          this.openHandler = void 0;
        });
      }
      openTextDocument(params) {
        this.openHandler && this.openHandler(params);
      }
      onDidChangeTextDocument(handler) {
        this.changeHandler = handler;
        return vscode_languageserver_protocol_1.Disposable.create(() => {
          this.changeHandler = handler;
        });
      }
      changeTextDocument(params) {
        this.changeHandler && this.changeHandler(params);
      }
      onDidCloseTextDocument(handler) {
        this.closeHandler = handler;
        return vscode_languageserver_protocol_1.Disposable.create(() => {
          this.closeHandler = void 0;
        });
      }
      closeTextDocument(params) {
        this.closeHandler && this.closeHandler(params);
      }
      onWillSaveTextDocument() {
        return _CellTextDocumentConnection.NULL_DISPOSE;
      }
      onWillSaveTextDocumentWaitUntil() {
        return _CellTextDocumentConnection.NULL_DISPOSE;
      }
      onDidSaveTextDocument() {
        return _CellTextDocumentConnection.NULL_DISPOSE;
      }
    };
    CellTextDocumentConnection.NULL_DISPOSE = Object.freeze({ dispose: () => {
    } });
    var NotebookDocuments = class {
      constructor(configurationOrTextDocuments) {
        if (configurationOrTextDocuments instanceof textDocuments_1.TextDocuments) {
          this._cellTextDocuments = configurationOrTextDocuments;
        } else {
          this._cellTextDocuments = new textDocuments_1.TextDocuments(configurationOrTextDocuments);
        }
        this.notebookDocuments = /* @__PURE__ */ new Map();
        this.notebookCellMap = /* @__PURE__ */ new Map();
        this._onDidOpen = new vscode_languageserver_protocol_1.Emitter();
        this._onDidChange = new vscode_languageserver_protocol_1.Emitter();
        this._onDidSave = new vscode_languageserver_protocol_1.Emitter();
        this._onDidClose = new vscode_languageserver_protocol_1.Emitter();
      }
      get cellTextDocuments() {
        return this._cellTextDocuments;
      }
      getCellTextDocument(cell) {
        return this._cellTextDocuments.get(cell.document);
      }
      getNotebookDocument(uri) {
        return this.notebookDocuments.get(uri);
      }
      getNotebookCell(uri) {
        const value = this.notebookCellMap.get(uri);
        return value && value[0];
      }
      findNotebookDocumentForCell(cell) {
        const key = typeof cell === "string" ? cell : cell.document;
        const value = this.notebookCellMap.get(key);
        return value && value[1];
      }
      get onDidOpen() {
        return this._onDidOpen.event;
      }
      get onDidSave() {
        return this._onDidSave.event;
      }
      get onDidChange() {
        return this._onDidChange.event;
      }
      get onDidClose() {
        return this._onDidClose.event;
      }
      /**
       * Listens for `low level` notification on the given connection to
       * update the notebook documents managed by this instance.
       *
       * Please note that the connection only provides handlers not an event model. Therefore
       * listening on a connection will overwrite the following handlers on a connection:
       * `onDidOpenNotebookDocument`, `onDidChangeNotebookDocument`, `onDidSaveNotebookDocument`,
       *  and `onDidCloseNotebookDocument`.
       *
       * @param connection The connection to listen on.
       */
      listen(connection2) {
        const cellTextDocumentConnection = new CellTextDocumentConnection();
        const disposables = [];
        disposables.push(this.cellTextDocuments.listen(cellTextDocumentConnection));
        disposables.push(connection2.notebooks.synchronization.onDidOpenNotebookDocument((params) => {
          this.notebookDocuments.set(params.notebookDocument.uri, params.notebookDocument);
          for (const cellTextDocument of params.cellTextDocuments) {
            cellTextDocumentConnection.openTextDocument({ textDocument: cellTextDocument });
          }
          this.updateCellMap(params.notebookDocument);
          this._onDidOpen.fire(params.notebookDocument);
        }));
        disposables.push(connection2.notebooks.synchronization.onDidChangeNotebookDocument((params) => {
          const notebookDocument = this.notebookDocuments.get(params.notebookDocument.uri);
          if (notebookDocument === void 0) {
            return;
          }
          notebookDocument.version = params.notebookDocument.version;
          const oldMetadata = notebookDocument.metadata;
          let metadataChanged = false;
          const change = params.change;
          if (change.metadata !== void 0) {
            metadataChanged = true;
            notebookDocument.metadata = change.metadata;
          }
          const opened = [];
          const closed = [];
          const data = [];
          const text = [];
          if (change.cells !== void 0) {
            const changedCells = change.cells;
            if (changedCells.structure !== void 0) {
              const array = changedCells.structure.array;
              notebookDocument.cells.splice(array.start, array.deleteCount, ...array.cells !== void 0 ? array.cells : []);
              if (changedCells.structure.didOpen !== void 0) {
                for (const open of changedCells.structure.didOpen) {
                  cellTextDocumentConnection.openTextDocument({ textDocument: open });
                  opened.push(open.uri);
                }
              }
              if (changedCells.structure.didClose) {
                for (const close of changedCells.structure.didClose) {
                  cellTextDocumentConnection.closeTextDocument({ textDocument: close });
                  closed.push(close.uri);
                }
              }
            }
            if (changedCells.data !== void 0) {
              const cellUpdates = new Map(changedCells.data.map((cell) => [cell.document, cell]));
              for (let i = 0; i <= notebookDocument.cells.length; i++) {
                const change2 = cellUpdates.get(notebookDocument.cells[i].document);
                if (change2 !== void 0) {
                  const old = notebookDocument.cells.splice(i, 1, change2);
                  data.push({ old: old[0], new: change2 });
                  cellUpdates.delete(change2.document);
                  if (cellUpdates.size === 0) {
                    break;
                  }
                }
              }
            }
            if (changedCells.textContent !== void 0) {
              for (const cellTextDocument of changedCells.textContent) {
                cellTextDocumentConnection.changeTextDocument({ textDocument: cellTextDocument.document, contentChanges: cellTextDocument.changes });
                text.push(cellTextDocument.document.uri);
              }
            }
          }
          this.updateCellMap(notebookDocument);
          const changeEvent = { notebookDocument };
          if (metadataChanged) {
            changeEvent.metadata = { old: oldMetadata, new: notebookDocument.metadata };
          }
          const added = [];
          for (const open of opened) {
            added.push(this.getNotebookCell(open));
          }
          const removed = [];
          for (const close of closed) {
            removed.push(this.getNotebookCell(close));
          }
          const textContent = [];
          for (const change2 of text) {
            textContent.push(this.getNotebookCell(change2));
          }
          if (added.length > 0 || removed.length > 0 || data.length > 0 || textContent.length > 0) {
            changeEvent.cells = { added, removed, changed: { data, textContent } };
          }
          if (changeEvent.metadata !== void 0 || changeEvent.cells !== void 0) {
            this._onDidChange.fire(changeEvent);
          }
        }));
        disposables.push(connection2.notebooks.synchronization.onDidSaveNotebookDocument((params) => {
          const notebookDocument = this.notebookDocuments.get(params.notebookDocument.uri);
          if (notebookDocument === void 0) {
            return;
          }
          this._onDidSave.fire(notebookDocument);
        }));
        disposables.push(connection2.notebooks.synchronization.onDidCloseNotebookDocument((params) => {
          const notebookDocument = this.notebookDocuments.get(params.notebookDocument.uri);
          if (notebookDocument === void 0) {
            return;
          }
          this._onDidClose.fire(notebookDocument);
          for (const cellTextDocument of params.cellTextDocuments) {
            cellTextDocumentConnection.closeTextDocument({ textDocument: cellTextDocument });
          }
          this.notebookDocuments.delete(params.notebookDocument.uri);
          for (const cell of notebookDocument.cells) {
            this.notebookCellMap.delete(cell.document);
          }
        }));
        return vscode_languageserver_protocol_1.Disposable.create(() => {
          disposables.forEach((disposable) => disposable.dispose());
        });
      }
      updateCellMap(notebookDocument) {
        for (const cell of notebookDocument.cells) {
          this.notebookCellMap.set(cell.document, [cell, notebookDocument]);
        }
      }
    };
    exports2.NotebookDocuments = NotebookDocuments;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/moniker.js
var require_moniker = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/moniker.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MonikerFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var MonikerFeature = (Base) => {
      return class extends Base {
        get moniker() {
          return {
            on: (handler) => {
              const type = vscode_languageserver_protocol_1.MonikerRequest.type;
              return this.connection.onRequest(type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params), this.attachPartialResultProgress(type, params));
              });
            }
          };
        }
      };
    };
    exports2.MonikerFeature = MonikerFeature;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/server.js
var require_server = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/server.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createConnection = exports2.combineFeatures = exports2.combineNotebooksFeatures = exports2.combineLanguagesFeatures = exports2.combineWorkspaceFeatures = exports2.combineWindowFeatures = exports2.combineClientFeatures = exports2.combineTracerFeatures = exports2.combineTelemetryFeatures = exports2.combineConsoleFeatures = exports2._NotebooksImpl = exports2._LanguagesImpl = exports2.BulkUnregistration = exports2.BulkRegistration = exports2.ErrorMessageTracker = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var Is = require_is();
    var UUID = require_uuid();
    var progress_1 = require_progress();
    var configuration_1 = require_configuration();
    var workspaceFolder_1 = require_workspaceFolder();
    var callHierarchy_1 = require_callHierarchy();
    var semanticTokens_1 = require_semanticTokens();
    var showDocument_1 = require_showDocument();
    var fileOperations_1 = require_fileOperations();
    var linkedEditingRange_1 = require_linkedEditingRange();
    var typeHierarchy_1 = require_typeHierarchy();
    var inlineValue_1 = require_inlineValue();
    var foldingRange_1 = require_foldingRange();
    var inlayHint_1 = require_inlayHint();
    var diagnostic_1 = require_diagnostic();
    var notebook_1 = require_notebook();
    var moniker_1 = require_moniker();
    function null2Undefined(value) {
      if (value === null) {
        return void 0;
      }
      return value;
    }
    var ErrorMessageTracker = class {
      constructor() {
        this._messages = /* @__PURE__ */ Object.create(null);
      }
      /**
       * Add a message to the tracker.
       *
       * @param message The message to add.
       */
      add(message) {
        let count = this._messages[message];
        if (!count) {
          count = 0;
        }
        count++;
        this._messages[message] = count;
      }
      /**
       * Send all tracked messages to the connection's window.
       *
       * @param connection The connection established between client and server.
       */
      sendErrors(connection2) {
        Object.keys(this._messages).forEach((message) => {
          connection2.window.showErrorMessage(message);
        });
      }
    };
    exports2.ErrorMessageTracker = ErrorMessageTracker;
    var RemoteConsoleImpl = class {
      constructor() {
      }
      rawAttach(connection2) {
        this._rawConnection = connection2;
      }
      attach(connection2) {
        this._connection = connection2;
      }
      get connection() {
        if (!this._connection) {
          throw new Error("Remote is not attached to a connection yet.");
        }
        return this._connection;
      }
      fillServerCapabilities(_capabilities) {
      }
      initialize(_capabilities) {
      }
      error(message) {
        this.send(vscode_languageserver_protocol_1.MessageType.Error, message);
      }
      warn(message) {
        this.send(vscode_languageserver_protocol_1.MessageType.Warning, message);
      }
      info(message) {
        this.send(vscode_languageserver_protocol_1.MessageType.Info, message);
      }
      log(message) {
        this.send(vscode_languageserver_protocol_1.MessageType.Log, message);
      }
      debug(message) {
        this.send(vscode_languageserver_protocol_1.MessageType.Debug, message);
      }
      send(type, message) {
        if (this._rawConnection) {
          this._rawConnection.sendNotification(vscode_languageserver_protocol_1.LogMessageNotification.type, { type, message }).catch(() => {
            (0, vscode_languageserver_protocol_1.RAL)().console.error(`Sending log message failed`);
          });
        }
      }
    };
    var _RemoteWindowImpl = class {
      constructor() {
      }
      attach(connection2) {
        this._connection = connection2;
      }
      get connection() {
        if (!this._connection) {
          throw new Error("Remote is not attached to a connection yet.");
        }
        return this._connection;
      }
      initialize(_capabilities) {
      }
      fillServerCapabilities(_capabilities) {
      }
      showErrorMessage(message, ...actions) {
        let params = { type: vscode_languageserver_protocol_1.MessageType.Error, message, actions };
        return this.connection.sendRequest(vscode_languageserver_protocol_1.ShowMessageRequest.type, params).then(null2Undefined);
      }
      showWarningMessage(message, ...actions) {
        let params = { type: vscode_languageserver_protocol_1.MessageType.Warning, message, actions };
        return this.connection.sendRequest(vscode_languageserver_protocol_1.ShowMessageRequest.type, params).then(null2Undefined);
      }
      showInformationMessage(message, ...actions) {
        let params = { type: vscode_languageserver_protocol_1.MessageType.Info, message, actions };
        return this.connection.sendRequest(vscode_languageserver_protocol_1.ShowMessageRequest.type, params).then(null2Undefined);
      }
    };
    var RemoteWindowImpl = (0, showDocument_1.ShowDocumentFeature)((0, progress_1.ProgressFeature)(_RemoteWindowImpl));
    var BulkRegistration;
    (function(BulkRegistration2) {
      function create() {
        return new BulkRegistrationImpl();
      }
      BulkRegistration2.create = create;
    })(BulkRegistration || (exports2.BulkRegistration = BulkRegistration = {}));
    var BulkRegistrationImpl = class {
      constructor() {
        this._registrations = [];
        this._registered = /* @__PURE__ */ new Set();
      }
      add(type, registerOptions) {
        const method = Is.string(type) ? type : type.method;
        if (this._registered.has(method)) {
          throw new Error(`${method} is already added to this registration`);
        }
        const id = UUID.generateUuid();
        this._registrations.push({
          id,
          method,
          registerOptions: registerOptions || {}
        });
        this._registered.add(method);
      }
      asRegistrationParams() {
        return {
          registrations: this._registrations
        };
      }
    };
    var BulkUnregistration;
    (function(BulkUnregistration2) {
      function create() {
        return new BulkUnregistrationImpl(void 0, []);
      }
      BulkUnregistration2.create = create;
    })(BulkUnregistration || (exports2.BulkUnregistration = BulkUnregistration = {}));
    var BulkUnregistrationImpl = class {
      constructor(_connection, unregistrations) {
        this._connection = _connection;
        this._unregistrations = /* @__PURE__ */ new Map();
        unregistrations.forEach((unregistration) => {
          this._unregistrations.set(unregistration.method, unregistration);
        });
      }
      get isAttached() {
        return !!this._connection;
      }
      attach(connection2) {
        this._connection = connection2;
      }
      add(unregistration) {
        this._unregistrations.set(unregistration.method, unregistration);
      }
      dispose() {
        let unregistrations = [];
        for (let unregistration of this._unregistrations.values()) {
          unregistrations.push(unregistration);
        }
        let params = {
          unregisterations: unregistrations
        };
        this._connection.sendRequest(vscode_languageserver_protocol_1.UnregistrationRequest.type, params).catch(() => {
          this._connection.console.info(`Bulk unregistration failed.`);
        });
      }
      disposeSingle(arg) {
        const method = Is.string(arg) ? arg : arg.method;
        const unregistration = this._unregistrations.get(method);
        if (!unregistration) {
          return false;
        }
        let params = {
          unregisterations: [unregistration]
        };
        this._connection.sendRequest(vscode_languageserver_protocol_1.UnregistrationRequest.type, params).then(() => {
          this._unregistrations.delete(method);
        }, (_error) => {
          this._connection.console.info(`Un-registering request handler for ${unregistration.id} failed.`);
        });
        return true;
      }
    };
    var RemoteClientImpl = class {
      attach(connection2) {
        this._connection = connection2;
      }
      get connection() {
        if (!this._connection) {
          throw new Error("Remote is not attached to a connection yet.");
        }
        return this._connection;
      }
      initialize(_capabilities) {
      }
      fillServerCapabilities(_capabilities) {
      }
      register(typeOrRegistrations, registerOptionsOrType, registerOptions) {
        if (typeOrRegistrations instanceof BulkRegistrationImpl) {
          return this.registerMany(typeOrRegistrations);
        } else if (typeOrRegistrations instanceof BulkUnregistrationImpl) {
          return this.registerSingle1(typeOrRegistrations, registerOptionsOrType, registerOptions);
        } else {
          return this.registerSingle2(typeOrRegistrations, registerOptionsOrType);
        }
      }
      registerSingle1(unregistration, type, registerOptions) {
        const method = Is.string(type) ? type : type.method;
        const id = UUID.generateUuid();
        let params = {
          registrations: [{ id, method, registerOptions: registerOptions || {} }]
        };
        if (!unregistration.isAttached) {
          unregistration.attach(this.connection);
        }
        return this.connection.sendRequest(vscode_languageserver_protocol_1.RegistrationRequest.type, params).then((_result) => {
          unregistration.add({ id, method });
          return unregistration;
        }, (_error) => {
          this.connection.console.info(`Registering request handler for ${method} failed.`);
          return Promise.reject(_error);
        });
      }
      registerSingle2(type, registerOptions) {
        const method = Is.string(type) ? type : type.method;
        const id = UUID.generateUuid();
        let params = {
          registrations: [{ id, method, registerOptions: registerOptions || {} }]
        };
        return this.connection.sendRequest(vscode_languageserver_protocol_1.RegistrationRequest.type, params).then((_result) => {
          return vscode_languageserver_protocol_1.Disposable.create(() => {
            this.unregisterSingle(id, method).catch(() => {
              this.connection.console.info(`Un-registering capability with id ${id} failed.`);
            });
          });
        }, (_error) => {
          this.connection.console.info(`Registering request handler for ${method} failed.`);
          return Promise.reject(_error);
        });
      }
      unregisterSingle(id, method) {
        let params = {
          unregisterations: [{ id, method }]
        };
        return this.connection.sendRequest(vscode_languageserver_protocol_1.UnregistrationRequest.type, params).catch(() => {
          this.connection.console.info(`Un-registering request handler for ${id} failed.`);
        });
      }
      registerMany(registrations) {
        let params = registrations.asRegistrationParams();
        return this.connection.sendRequest(vscode_languageserver_protocol_1.RegistrationRequest.type, params).then(() => {
          return new BulkUnregistrationImpl(this._connection, params.registrations.map((registration) => {
            return { id: registration.id, method: registration.method };
          }));
        }, (_error) => {
          this.connection.console.info(`Bulk registration failed.`);
          return Promise.reject(_error);
        });
      }
    };
    var _RemoteWorkspaceImpl = class {
      constructor() {
      }
      attach(connection2) {
        this._connection = connection2;
      }
      get connection() {
        if (!this._connection) {
          throw new Error("Remote is not attached to a connection yet.");
        }
        return this._connection;
      }
      initialize(_capabilities) {
      }
      fillServerCapabilities(_capabilities) {
      }
      applyEdit(paramOrEdit) {
        function isApplyWorkspaceEditParams(value) {
          return value && !!value.edit;
        }
        let params = isApplyWorkspaceEditParams(paramOrEdit) ? paramOrEdit : { edit: paramOrEdit };
        return this.connection.sendRequest(vscode_languageserver_protocol_1.ApplyWorkspaceEditRequest.type, params);
      }
    };
    var RemoteWorkspaceImpl = (0, fileOperations_1.FileOperationsFeature)((0, workspaceFolder_1.WorkspaceFoldersFeature)((0, configuration_1.ConfigurationFeature)(_RemoteWorkspaceImpl)));
    var TracerImpl = class {
      constructor() {
        this._trace = vscode_languageserver_protocol_1.Trace.Off;
      }
      attach(connection2) {
        this._connection = connection2;
      }
      get connection() {
        if (!this._connection) {
          throw new Error("Remote is not attached to a connection yet.");
        }
        return this._connection;
      }
      initialize(_capabilities) {
      }
      fillServerCapabilities(_capabilities) {
      }
      set trace(value) {
        this._trace = value;
      }
      log(message, verbose) {
        if (this._trace === vscode_languageserver_protocol_1.Trace.Off) {
          return;
        }
        this.connection.sendNotification(vscode_languageserver_protocol_1.LogTraceNotification.type, {
          message,
          verbose: this._trace === vscode_languageserver_protocol_1.Trace.Verbose ? verbose : void 0
        }).catch(() => {
        });
      }
    };
    var TelemetryImpl = class {
      constructor() {
      }
      attach(connection2) {
        this._connection = connection2;
      }
      get connection() {
        if (!this._connection) {
          throw new Error("Remote is not attached to a connection yet.");
        }
        return this._connection;
      }
      initialize(_capabilities) {
      }
      fillServerCapabilities(_capabilities) {
      }
      logEvent(data) {
        this.connection.sendNotification(vscode_languageserver_protocol_1.TelemetryEventNotification.type, data).catch(() => {
          this.connection.console.log(`Sending TelemetryEventNotification failed`);
        });
      }
    };
    var _LanguagesImpl = class {
      constructor() {
      }
      attach(connection2) {
        this._connection = connection2;
      }
      get connection() {
        if (!this._connection) {
          throw new Error("Remote is not attached to a connection yet.");
        }
        return this._connection;
      }
      initialize(_capabilities) {
      }
      fillServerCapabilities(_capabilities) {
      }
      attachWorkDoneProgress(params) {
        return (0, progress_1.attachWorkDone)(this.connection, params);
      }
      attachPartialResultProgress(_type, params) {
        return (0, progress_1.attachPartialResult)(this.connection, params);
      }
    };
    exports2._LanguagesImpl = _LanguagesImpl;
    var LanguagesImpl = (0, foldingRange_1.FoldingRangeFeature)((0, moniker_1.MonikerFeature)((0, diagnostic_1.DiagnosticFeature)((0, inlayHint_1.InlayHintFeature)((0, inlineValue_1.InlineValueFeature)((0, typeHierarchy_1.TypeHierarchyFeature)((0, linkedEditingRange_1.LinkedEditingRangeFeature)((0, semanticTokens_1.SemanticTokensFeature)((0, callHierarchy_1.CallHierarchyFeature)(_LanguagesImpl)))))))));
    var _NotebooksImpl = class {
      constructor() {
      }
      attach(connection2) {
        this._connection = connection2;
      }
      get connection() {
        if (!this._connection) {
          throw new Error("Remote is not attached to a connection yet.");
        }
        return this._connection;
      }
      initialize(_capabilities) {
      }
      fillServerCapabilities(_capabilities) {
      }
      attachWorkDoneProgress(params) {
        return (0, progress_1.attachWorkDone)(this.connection, params);
      }
      attachPartialResultProgress(_type, params) {
        return (0, progress_1.attachPartialResult)(this.connection, params);
      }
    };
    exports2._NotebooksImpl = _NotebooksImpl;
    var NotebooksImpl = (0, notebook_1.NotebookSyncFeature)(_NotebooksImpl);
    function combineConsoleFeatures(one, two) {
      return function(Base) {
        return two(one(Base));
      };
    }
    exports2.combineConsoleFeatures = combineConsoleFeatures;
    function combineTelemetryFeatures(one, two) {
      return function(Base) {
        return two(one(Base));
      };
    }
    exports2.combineTelemetryFeatures = combineTelemetryFeatures;
    function combineTracerFeatures(one, two) {
      return function(Base) {
        return two(one(Base));
      };
    }
    exports2.combineTracerFeatures = combineTracerFeatures;
    function combineClientFeatures(one, two) {
      return function(Base) {
        return two(one(Base));
      };
    }
    exports2.combineClientFeatures = combineClientFeatures;
    function combineWindowFeatures(one, two) {
      return function(Base) {
        return two(one(Base));
      };
    }
    exports2.combineWindowFeatures = combineWindowFeatures;
    function combineWorkspaceFeatures(one, two) {
      return function(Base) {
        return two(one(Base));
      };
    }
    exports2.combineWorkspaceFeatures = combineWorkspaceFeatures;
    function combineLanguagesFeatures(one, two) {
      return function(Base) {
        return two(one(Base));
      };
    }
    exports2.combineLanguagesFeatures = combineLanguagesFeatures;
    function combineNotebooksFeatures(one, two) {
      return function(Base) {
        return two(one(Base));
      };
    }
    exports2.combineNotebooksFeatures = combineNotebooksFeatures;
    function combineFeatures(one, two) {
      function combine(one2, two2, func) {
        if (one2 && two2) {
          return func(one2, two2);
        } else if (one2) {
          return one2;
        } else {
          return two2;
        }
      }
      let result = {
        __brand: "features",
        console: combine(one.console, two.console, combineConsoleFeatures),
        tracer: combine(one.tracer, two.tracer, combineTracerFeatures),
        telemetry: combine(one.telemetry, two.telemetry, combineTelemetryFeatures),
        client: combine(one.client, two.client, combineClientFeatures),
        window: combine(one.window, two.window, combineWindowFeatures),
        workspace: combine(one.workspace, two.workspace, combineWorkspaceFeatures),
        languages: combine(one.languages, two.languages, combineLanguagesFeatures),
        notebooks: combine(one.notebooks, two.notebooks, combineNotebooksFeatures)
      };
      return result;
    }
    exports2.combineFeatures = combineFeatures;
    function createConnection2(connectionFactory, watchDog, factories) {
      const logger = factories && factories.console ? new (factories.console(RemoteConsoleImpl))() : new RemoteConsoleImpl();
      const connection2 = connectionFactory(logger);
      logger.rawAttach(connection2);
      const tracer = factories && factories.tracer ? new (factories.tracer(TracerImpl))() : new TracerImpl();
      const telemetry = factories && factories.telemetry ? new (factories.telemetry(TelemetryImpl))() : new TelemetryImpl();
      const client = factories && factories.client ? new (factories.client(RemoteClientImpl))() : new RemoteClientImpl();
      const remoteWindow = factories && factories.window ? new (factories.window(RemoteWindowImpl))() : new RemoteWindowImpl();
      const workspace = factories && factories.workspace ? new (factories.workspace(RemoteWorkspaceImpl))() : new RemoteWorkspaceImpl();
      const languages = factories && factories.languages ? new (factories.languages(LanguagesImpl))() : new LanguagesImpl();
      const notebooks = factories && factories.notebooks ? new (factories.notebooks(NotebooksImpl))() : new NotebooksImpl();
      const allRemotes = [logger, tracer, telemetry, client, remoteWindow, workspace, languages, notebooks];
      function asPromise(value) {
        if (value instanceof Promise) {
          return value;
        } else if (Is.thenable(value)) {
          return new Promise((resolve2, reject) => {
            value.then((resolved) => resolve2(resolved), (error) => reject(error));
          });
        } else {
          return Promise.resolve(value);
        }
      }
      let shutdownHandler = void 0;
      let initializeHandler = void 0;
      let exitHandler = void 0;
      let protocolConnection = {
        listen: () => connection2.listen(),
        sendRequest: (type, ...params) => connection2.sendRequest(Is.string(type) ? type : type.method, ...params),
        onRequest: (type, handler) => connection2.onRequest(type, handler),
        sendNotification: (type, param) => {
          const method = Is.string(type) ? type : type.method;
          return connection2.sendNotification(method, param);
        },
        onNotification: (type, handler) => connection2.onNotification(type, handler),
        onProgress: connection2.onProgress,
        sendProgress: connection2.sendProgress,
        onInitialize: (handler) => {
          initializeHandler = handler;
          return {
            dispose: () => {
              initializeHandler = void 0;
            }
          };
        },
        onInitialized: (handler) => connection2.onNotification(vscode_languageserver_protocol_1.InitializedNotification.type, handler),
        onShutdown: (handler) => {
          shutdownHandler = handler;
          return {
            dispose: () => {
              shutdownHandler = void 0;
            }
          };
        },
        onExit: (handler) => {
          exitHandler = handler;
          return {
            dispose: () => {
              exitHandler = void 0;
            }
          };
        },
        get console() {
          return logger;
        },
        get telemetry() {
          return telemetry;
        },
        get tracer() {
          return tracer;
        },
        get client() {
          return client;
        },
        get window() {
          return remoteWindow;
        },
        get workspace() {
          return workspace;
        },
        get languages() {
          return languages;
        },
        get notebooks() {
          return notebooks;
        },
        onDidChangeConfiguration: (handler) => connection2.onNotification(vscode_languageserver_protocol_1.DidChangeConfigurationNotification.type, handler),
        onDidChangeWatchedFiles: (handler) => connection2.onNotification(vscode_languageserver_protocol_1.DidChangeWatchedFilesNotification.type, handler),
        __textDocumentSync: void 0,
        onDidOpenTextDocument: (handler) => connection2.onNotification(vscode_languageserver_protocol_1.DidOpenTextDocumentNotification.type, handler),
        onDidChangeTextDocument: (handler) => connection2.onNotification(vscode_languageserver_protocol_1.DidChangeTextDocumentNotification.type, handler),
        onDidCloseTextDocument: (handler) => connection2.onNotification(vscode_languageserver_protocol_1.DidCloseTextDocumentNotification.type, handler),
        onWillSaveTextDocument: (handler) => connection2.onNotification(vscode_languageserver_protocol_1.WillSaveTextDocumentNotification.type, handler),
        onWillSaveTextDocumentWaitUntil: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.WillSaveTextDocumentWaitUntilRequest.type, handler),
        onDidSaveTextDocument: (handler) => connection2.onNotification(vscode_languageserver_protocol_1.DidSaveTextDocumentNotification.type, handler),
        sendDiagnostics: (params) => connection2.sendNotification(vscode_languageserver_protocol_1.PublishDiagnosticsNotification.type, params),
        onHover: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.HoverRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), void 0);
        }),
        onCompletion: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.CompletionRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onCompletionResolve: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.CompletionResolveRequest.type, handler),
        onSignatureHelp: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.SignatureHelpRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), void 0);
        }),
        onDeclaration: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DeclarationRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onDefinition: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DefinitionRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onTypeDefinition: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.TypeDefinitionRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onImplementation: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.ImplementationRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onReferences: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.ReferencesRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onDocumentHighlight: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DocumentHighlightRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onDocumentSymbol: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DocumentSymbolRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onWorkspaceSymbol: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.WorkspaceSymbolRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onWorkspaceSymbolResolve: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.WorkspaceSymbolResolveRequest.type, handler),
        onCodeAction: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.CodeActionRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onCodeActionResolve: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.CodeActionResolveRequest.type, (params, cancel) => {
          return handler(params, cancel);
        }),
        onCodeLens: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.CodeLensRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onCodeLensResolve: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.CodeLensResolveRequest.type, (params, cancel) => {
          return handler(params, cancel);
        }),
        onDocumentFormatting: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DocumentFormattingRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), void 0);
        }),
        onDocumentRangeFormatting: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DocumentRangeFormattingRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), void 0);
        }),
        onDocumentOnTypeFormatting: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DocumentOnTypeFormattingRequest.type, (params, cancel) => {
          return handler(params, cancel);
        }),
        onRenameRequest: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.RenameRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), void 0);
        }),
        onPrepareRename: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.PrepareRenameRequest.type, (params, cancel) => {
          return handler(params, cancel);
        }),
        onDocumentLinks: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DocumentLinkRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onDocumentLinkResolve: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DocumentLinkResolveRequest.type, (params, cancel) => {
          return handler(params, cancel);
        }),
        onDocumentColor: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.DocumentColorRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onColorPresentation: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.ColorPresentationRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onFoldingRanges: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.FoldingRangeRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onSelectionRanges: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.SelectionRangeRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), (0, progress_1.attachPartialResult)(connection2, params));
        }),
        onExecuteCommand: (handler) => connection2.onRequest(vscode_languageserver_protocol_1.ExecuteCommandRequest.type, (params, cancel) => {
          return handler(params, cancel, (0, progress_1.attachWorkDone)(connection2, params), void 0);
        }),
        dispose: () => connection2.dispose()
      };
      for (let remote of allRemotes) {
        remote.attach(protocolConnection);
      }
      connection2.onRequest(vscode_languageserver_protocol_1.InitializeRequest.type, (params) => {
        watchDog.initialize(params);
        if (Is.string(params.trace)) {
          tracer.trace = vscode_languageserver_protocol_1.Trace.fromString(params.trace);
        }
        for (let remote of allRemotes) {
          remote.initialize(params.capabilities);
        }
        if (initializeHandler) {
          let result = initializeHandler(params, new vscode_languageserver_protocol_1.CancellationTokenSource().token, (0, progress_1.attachWorkDone)(connection2, params), void 0);
          return asPromise(result).then((value) => {
            if (value instanceof vscode_languageserver_protocol_1.ResponseError) {
              return value;
            }
            let result2 = value;
            if (!result2) {
              result2 = { capabilities: {} };
            }
            let capabilities = result2.capabilities;
            if (!capabilities) {
              capabilities = {};
              result2.capabilities = capabilities;
            }
            if (capabilities.textDocumentSync === void 0 || capabilities.textDocumentSync === null) {
              capabilities.textDocumentSync = Is.number(protocolConnection.__textDocumentSync) ? protocolConnection.__textDocumentSync : vscode_languageserver_protocol_1.TextDocumentSyncKind.None;
            } else if (!Is.number(capabilities.textDocumentSync) && !Is.number(capabilities.textDocumentSync.change)) {
              capabilities.textDocumentSync.change = Is.number(protocolConnection.__textDocumentSync) ? protocolConnection.__textDocumentSync : vscode_languageserver_protocol_1.TextDocumentSyncKind.None;
            }
            for (let remote of allRemotes) {
              remote.fillServerCapabilities(capabilities);
            }
            return result2;
          });
        } else {
          let result = { capabilities: { textDocumentSync: vscode_languageserver_protocol_1.TextDocumentSyncKind.None } };
          for (let remote of allRemotes) {
            remote.fillServerCapabilities(result.capabilities);
          }
          return result;
        }
      });
      connection2.onRequest(vscode_languageserver_protocol_1.ShutdownRequest.type, () => {
        watchDog.shutdownReceived = true;
        if (shutdownHandler) {
          return shutdownHandler(new vscode_languageserver_protocol_1.CancellationTokenSource().token);
        } else {
          return void 0;
        }
      });
      connection2.onNotification(vscode_languageserver_protocol_1.ExitNotification.type, () => {
        try {
          if (exitHandler) {
            exitHandler();
          }
        } finally {
          if (watchDog.shutdownReceived) {
            watchDog.exit(0);
          } else {
            watchDog.exit(1);
          }
        }
      });
      connection2.onNotification(vscode_languageserver_protocol_1.SetTraceNotification.type, (params) => {
        tracer.trace = vscode_languageserver_protocol_1.Trace.fromString(params.value);
      });
      return protocolConnection;
    }
    exports2.createConnection = createConnection2;
  }
});

// ../../node_modules/vscode-languageserver/lib/node/files.js
var require_files = __commonJS({
  "../../node_modules/vscode-languageserver/lib/node/files.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.resolveModulePath = exports2.FileSystem = exports2.resolveGlobalYarnPath = exports2.resolveGlobalNodePath = exports2.resolve = exports2.uriToFilePath = void 0;
    var url = require("url");
    var path2 = require("path");
    var fs2 = require("fs");
    var child_process_1 = require("child_process");
    function uriToFilePath(uri) {
      let parsed = url.parse(uri);
      if (parsed.protocol !== "file:" || !parsed.path) {
        return void 0;
      }
      let segments = parsed.path.split("/");
      for (var i = 0, len = segments.length; i < len; i++) {
        segments[i] = decodeURIComponent(segments[i]);
      }
      if (process.platform === "win32" && segments.length > 1) {
        let first = segments[0];
        let second = segments[1];
        if (first.length === 0 && second.length > 1 && second[1] === ":") {
          segments.shift();
        }
      }
      return path2.normalize(segments.join("/"));
    }
    exports2.uriToFilePath = uriToFilePath;
    function isWindows() {
      return process.platform === "win32";
    }
    function resolve2(moduleName, nodePath, cwd, tracer) {
      const nodePathKey = "NODE_PATH";
      const app = [
        "var p = process;",
        "p.on('message',function(m){",
        "if(m.c==='e'){",
        "p.exit(0);",
        "}",
        "else if(m.c==='rs'){",
        "try{",
        "var r=require.resolve(m.a);",
        "p.send({c:'r',s:true,r:r});",
        "}",
        "catch(err){",
        "p.send({c:'r',s:false});",
        "}",
        "}",
        "});"
      ].join("");
      return new Promise((resolve3, reject) => {
        let env = process.env;
        let newEnv = /* @__PURE__ */ Object.create(null);
        Object.keys(env).forEach((key) => newEnv[key] = env[key]);
        if (nodePath && fs2.existsSync(nodePath)) {
          if (newEnv[nodePathKey]) {
            newEnv[nodePathKey] = nodePath + path2.delimiter + newEnv[nodePathKey];
          } else {
            newEnv[nodePathKey] = nodePath;
          }
          if (tracer) {
            tracer(`NODE_PATH value is: ${newEnv[nodePathKey]}`);
          }
        }
        newEnv["ELECTRON_RUN_AS_NODE"] = "1";
        try {
          let cp = (0, child_process_1.fork)("", [], {
            cwd,
            env: newEnv,
            execArgv: ["-e", app]
          });
          if (cp.pid === void 0) {
            reject(new Error(`Starting process to resolve node module  ${moduleName} failed`));
            return;
          }
          cp.on("error", (error) => {
            reject(error);
          });
          cp.on("message", (message2) => {
            if (message2.c === "r") {
              cp.send({ c: "e" });
              if (message2.s) {
                resolve3(message2.r);
              } else {
                reject(new Error(`Failed to resolve module: ${moduleName}`));
              }
            }
          });
          let message = {
            c: "rs",
            a: moduleName
          };
          cp.send(message);
        } catch (error) {
          reject(error);
        }
      });
    }
    exports2.resolve = resolve2;
    function resolveGlobalNodePath(tracer) {
      let npmCommand = "npm";
      const env = /* @__PURE__ */ Object.create(null);
      Object.keys(process.env).forEach((key) => env[key] = process.env[key]);
      env["NO_UPDATE_NOTIFIER"] = "true";
      const options = {
        encoding: "utf8",
        env
      };
      if (isWindows()) {
        npmCommand = "npm.cmd";
        options.shell = true;
      }
      let handler = () => {
      };
      try {
        process.on("SIGPIPE", handler);
        let stdout = (0, child_process_1.spawnSync)(npmCommand, ["config", "get", "prefix"], options).stdout;
        if (!stdout) {
          if (tracer) {
            tracer(`'npm config get prefix' didn't return a value.`);
          }
          return void 0;
        }
        let prefix = stdout.trim();
        if (tracer) {
          tracer(`'npm config get prefix' value is: ${prefix}`);
        }
        if (prefix.length > 0) {
          if (isWindows()) {
            return path2.join(prefix, "node_modules");
          } else {
            return path2.join(prefix, "lib", "node_modules");
          }
        }
        return void 0;
      } catch (err) {
        return void 0;
      } finally {
        process.removeListener("SIGPIPE", handler);
      }
    }
    exports2.resolveGlobalNodePath = resolveGlobalNodePath;
    function resolveGlobalYarnPath(tracer) {
      let yarnCommand = "yarn";
      let options = {
        encoding: "utf8"
      };
      if (isWindows()) {
        yarnCommand = "yarn.cmd";
        options.shell = true;
      }
      let handler = () => {
      };
      try {
        process.on("SIGPIPE", handler);
        let results = (0, child_process_1.spawnSync)(yarnCommand, ["global", "dir", "--json"], options);
        let stdout = results.stdout;
        if (!stdout) {
          if (tracer) {
            tracer(`'yarn global dir' didn't return a value.`);
            if (results.stderr) {
              tracer(results.stderr);
            }
          }
          return void 0;
        }
        let lines = stdout.trim().split(/\r?\n/);
        for (let line of lines) {
          try {
            let yarn = JSON.parse(line);
            if (yarn.type === "log") {
              return path2.join(yarn.data, "node_modules");
            }
          } catch (e) {
          }
        }
        return void 0;
      } catch (err) {
        return void 0;
      } finally {
        process.removeListener("SIGPIPE", handler);
      }
    }
    exports2.resolveGlobalYarnPath = resolveGlobalYarnPath;
    var FileSystem;
    (function(FileSystem2) {
      let _isCaseSensitive = void 0;
      function isCaseSensitive() {
        if (_isCaseSensitive !== void 0) {
          return _isCaseSensitive;
        }
        if (process.platform === "win32") {
          _isCaseSensitive = false;
        } else {
          _isCaseSensitive = !fs2.existsSync(__filename.toUpperCase()) || !fs2.existsSync(__filename.toLowerCase());
        }
        return _isCaseSensitive;
      }
      FileSystem2.isCaseSensitive = isCaseSensitive;
      function isParent(parent, child) {
        if (isCaseSensitive()) {
          return path2.normalize(child).indexOf(path2.normalize(parent)) === 0;
        } else {
          return path2.normalize(child).toLowerCase().indexOf(path2.normalize(parent).toLowerCase()) === 0;
        }
      }
      FileSystem2.isParent = isParent;
    })(FileSystem || (exports2.FileSystem = FileSystem = {}));
    function resolveModulePath(workspaceRoot, moduleName, nodePath, tracer) {
      if (nodePath) {
        if (!path2.isAbsolute(nodePath)) {
          nodePath = path2.join(workspaceRoot, nodePath);
        }
        return resolve2(moduleName, nodePath, nodePath, tracer).then((value) => {
          if (FileSystem.isParent(nodePath, value)) {
            return value;
          } else {
            return Promise.reject(new Error(`Failed to load ${moduleName} from node path location.`));
          }
        }).then(void 0, (_error) => {
          return resolve2(moduleName, resolveGlobalNodePath(tracer), workspaceRoot, tracer);
        });
      } else {
        return resolve2(moduleName, resolveGlobalNodePath(tracer), workspaceRoot, tracer);
      }
    }
    exports2.resolveModulePath = resolveModulePath;
  }
});

// ../../node_modules/vscode-languageserver-protocol/node.js
var require_node2 = __commonJS({
  "../../node_modules/vscode-languageserver-protocol/node.js"(exports2, module2) {
    "use strict";
    module2.exports = require_main3();
  }
});

// ../../node_modules/vscode-languageserver/lib/common/inlineCompletion.proposed.js
var require_inlineCompletion_proposed = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/inlineCompletion.proposed.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.InlineCompletionFeature = void 0;
    var vscode_languageserver_protocol_1 = require_main3();
    var InlineCompletionFeature = (Base) => {
      return class extends Base {
        get inlineCompletion() {
          return {
            on: (handler) => {
              return this.connection.onRequest(vscode_languageserver_protocol_1.InlineCompletionRequest.type, (params, cancel) => {
                return handler(params, cancel, this.attachWorkDoneProgress(params));
              });
            }
          };
        }
      };
    };
    exports2.InlineCompletionFeature = InlineCompletionFeature;
  }
});

// ../../node_modules/vscode-languageserver/lib/common/api.js
var require_api3 = __commonJS({
  "../../node_modules/vscode-languageserver/lib/common/api.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ProposedFeatures = exports2.NotebookDocuments = exports2.TextDocuments = exports2.SemanticTokensBuilder = void 0;
    var semanticTokens_1 = require_semanticTokens();
    Object.defineProperty(exports2, "SemanticTokensBuilder", { enumerable: true, get: function() {
      return semanticTokens_1.SemanticTokensBuilder;
    } });
    var ic = require_inlineCompletion_proposed();
    __exportStar(require_main3(), exports2);
    var textDocuments_1 = require_textDocuments();
    Object.defineProperty(exports2, "TextDocuments", { enumerable: true, get: function() {
      return textDocuments_1.TextDocuments;
    } });
    var notebook_1 = require_notebook();
    Object.defineProperty(exports2, "NotebookDocuments", { enumerable: true, get: function() {
      return notebook_1.NotebookDocuments;
    } });
    __exportStar(require_server(), exports2);
    var ProposedFeatures2;
    (function(ProposedFeatures3) {
      ProposedFeatures3.all = {
        __brand: "features",
        languages: ic.InlineCompletionFeature
      };
    })(ProposedFeatures2 || (exports2.ProposedFeatures = ProposedFeatures2 = {}));
  }
});

// ../../node_modules/vscode-languageserver/lib/node/main.js
var require_main4 = __commonJS({
  "../../node_modules/vscode-languageserver/lib/node/main.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createConnection = exports2.Files = void 0;
    var node_util_1 = require("node:util");
    var Is = require_is();
    var server_1 = require_server();
    var fm = require_files();
    var node_1 = require_node2();
    __exportStar(require_node2(), exports2);
    __exportStar(require_api3(), exports2);
    var Files;
    (function(Files2) {
      Files2.uriToFilePath = fm.uriToFilePath;
      Files2.resolveGlobalNodePath = fm.resolveGlobalNodePath;
      Files2.resolveGlobalYarnPath = fm.resolveGlobalYarnPath;
      Files2.resolve = fm.resolve;
      Files2.resolveModulePath = fm.resolveModulePath;
    })(Files || (exports2.Files = Files = {}));
    var _protocolConnection;
    function endProtocolConnection() {
      if (_protocolConnection === void 0) {
        return;
      }
      try {
        _protocolConnection.end();
      } catch (_err) {
      }
    }
    var _shutdownReceived = false;
    var exitTimer = void 0;
    function setupExitTimer() {
      const argName = "--clientProcessId";
      function runTimer(value) {
        try {
          let processId = parseInt(value);
          if (!isNaN(processId)) {
            exitTimer = setInterval(() => {
              try {
                process.kill(processId, 0);
              } catch (ex) {
                endProtocolConnection();
                process.exit(_shutdownReceived ? 0 : 1);
              }
            }, 3e3);
          }
        } catch (e) {
        }
      }
      for (let i = 2; i < process.argv.length; i++) {
        let arg = process.argv[i];
        if (arg === argName && i + 1 < process.argv.length) {
          runTimer(process.argv[i + 1]);
          return;
        } else {
          let args = arg.split("=");
          if (args[0] === argName) {
            runTimer(args[1]);
          }
        }
      }
    }
    setupExitTimer();
    var watchDog = {
      initialize: (params) => {
        const processId = params.processId;
        if (Is.number(processId) && exitTimer === void 0) {
          setInterval(() => {
            try {
              process.kill(processId, 0);
            } catch (ex) {
              process.exit(_shutdownReceived ? 0 : 1);
            }
          }, 3e3);
        }
      },
      get shutdownReceived() {
        return _shutdownReceived;
      },
      set shutdownReceived(value) {
        _shutdownReceived = value;
      },
      exit: (code) => {
        endProtocolConnection();
        process.exit(code);
      }
    };
    function createConnection2(arg1, arg2, arg3, arg4) {
      let factories;
      let input;
      let output;
      let options;
      if (arg1 !== void 0 && arg1.__brand === "features") {
        factories = arg1;
        arg1 = arg2;
        arg2 = arg3;
        arg3 = arg4;
      }
      if (node_1.ConnectionStrategy.is(arg1) || node_1.ConnectionOptions.is(arg1)) {
        options = arg1;
      } else {
        input = arg1;
        output = arg2;
        options = arg3;
      }
      return _createConnection(input, output, options, factories);
    }
    exports2.createConnection = createConnection2;
    function _createConnection(input, output, options, factories) {
      let stdio = false;
      if (!input && !output && process.argv.length > 2) {
        let port = void 0;
        let pipeName = void 0;
        let argv = process.argv.slice(2);
        for (let i = 0; i < argv.length; i++) {
          let arg = argv[i];
          if (arg === "--node-ipc") {
            input = new node_1.IPCMessageReader(process);
            output = new node_1.IPCMessageWriter(process);
            break;
          } else if (arg === "--stdio") {
            stdio = true;
            input = process.stdin;
            output = process.stdout;
            break;
          } else if (arg === "--socket") {
            port = parseInt(argv[i + 1]);
            break;
          } else if (arg === "--pipe") {
            pipeName = argv[i + 1];
            break;
          } else {
            var args = arg.split("=");
            if (args[0] === "--socket") {
              port = parseInt(args[1]);
              break;
            } else if (args[0] === "--pipe") {
              pipeName = args[1];
              break;
            }
          }
        }
        if (port) {
          let transport = (0, node_1.createServerSocketTransport)(port);
          input = transport[0];
          output = transport[1];
        } else if (pipeName) {
          let transport = (0, node_1.createServerPipeTransport)(pipeName);
          input = transport[0];
          output = transport[1];
        }
      }
      var commandLineMessage = "Use arguments of createConnection or set command line parameters: '--node-ipc', '--stdio' or '--socket={number}'";
      if (!input) {
        throw new Error("Connection input stream is not set. " + commandLineMessage);
      }
      if (!output) {
        throw new Error("Connection output stream is not set. " + commandLineMessage);
      }
      if (Is.func(input.read) && Is.func(input.on)) {
        let inputStream = input;
        inputStream.on("end", () => {
          endProtocolConnection();
          process.exit(_shutdownReceived ? 0 : 1);
        });
        inputStream.on("close", () => {
          endProtocolConnection();
          process.exit(_shutdownReceived ? 0 : 1);
        });
      }
      const connectionFactory = (logger) => {
        const result = (0, node_1.createProtocolConnection)(input, output, logger, options);
        if (stdio) {
          patchConsole(logger);
        }
        return result;
      };
      return (0, server_1.createConnection)(connectionFactory, watchDog, factories);
    }
    function patchConsole(logger) {
      function serialize(args) {
        return args.map((arg) => typeof arg === "string" ? arg : (0, node_util_1.inspect)(arg)).join(" ");
      }
      const counters = /* @__PURE__ */ new Map();
      console.assert = function assert(assertion, ...args) {
        if (assertion) {
          return;
        }
        if (args.length === 0) {
          logger.error("Assertion failed");
        } else {
          const [message, ...rest] = args;
          logger.error(`Assertion failed: ${message} ${serialize(rest)}`);
        }
      };
      console.count = function count(label = "default") {
        const message = String(label);
        let counter = counters.get(message) ?? 0;
        counter += 1;
        counters.set(message, counter);
        logger.log(`${message}: ${message}`);
      };
      console.countReset = function countReset(label) {
        if (label === void 0) {
          counters.clear();
        } else {
          counters.delete(String(label));
        }
      };
      console.debug = function debug(...args) {
        logger.log(serialize(args));
      };
      console.dir = function dir(arg, options) {
        logger.log((0, node_util_1.inspect)(arg, options));
      };
      console.log = function log(...args) {
        logger.log(serialize(args));
      };
      console.error = function error(...args) {
        logger.error(serialize(args));
      };
      console.trace = function trace(...args) {
        const stack = new Error().stack.replace(/(.+\n){2}/, "");
        let message = "Trace";
        if (args.length !== 0) {
          message += `: ${serialize(args)}`;
        }
        logger.log(`${message}
${stack}`);
      };
      console.warn = function warn(...args) {
        logger.warn(serialize(args));
      };
    }
  }
});

// ../../node_modules/vscode-languageserver/node.js
var require_node3 = __commonJS({
  "../../node_modules/vscode-languageserver/node.js"(exports2, module2) {
    "use strict";
    module2.exports = require_main4();
  }
});

// ../../src/lsp/server.ts
var import_node = __toESM(require_node3());

// ../../node_modules/vscode-languageserver-textdocument/lib/esm/main.js
var FullTextDocument = class _FullTextDocument {
  constructor(uri, languageId, version, content) {
    this._uri = uri;
    this._languageId = languageId;
    this._version = version;
    this._content = content;
    this._lineOffsets = void 0;
  }
  get uri() {
    return this._uri;
  }
  get languageId() {
    return this._languageId;
  }
  get version() {
    return this._version;
  }
  getText(range) {
    if (range) {
      const start = this.offsetAt(range.start);
      const end = this.offsetAt(range.end);
      return this._content.substring(start, end);
    }
    return this._content;
  }
  update(changes, version) {
    for (const change of changes) {
      if (_FullTextDocument.isIncremental(change)) {
        const range = getWellformedRange(change.range);
        const startOffset = this.offsetAt(range.start);
        const endOffset = this.offsetAt(range.end);
        this._content = this._content.substring(0, startOffset) + change.text + this._content.substring(endOffset, this._content.length);
        const startLine = Math.max(range.start.line, 0);
        const endLine = Math.max(range.end.line, 0);
        let lineOffsets = this._lineOffsets;
        const addedLineOffsets = computeLineOffsets(change.text, false, startOffset);
        if (endLine - startLine === addedLineOffsets.length) {
          for (let i = 0, len = addedLineOffsets.length; i < len; i++) {
            lineOffsets[i + startLine + 1] = addedLineOffsets[i];
          }
        } else {
          if (addedLineOffsets.length < 1e4) {
            lineOffsets.splice(startLine + 1, endLine - startLine, ...addedLineOffsets);
          } else {
            this._lineOffsets = lineOffsets = lineOffsets.slice(0, startLine + 1).concat(addedLineOffsets, lineOffsets.slice(endLine + 1));
          }
        }
        const diff = change.text.length - (endOffset - startOffset);
        if (diff !== 0) {
          for (let i = startLine + 1 + addedLineOffsets.length, len = lineOffsets.length; i < len; i++) {
            lineOffsets[i] = lineOffsets[i] + diff;
          }
        }
      } else if (_FullTextDocument.isFull(change)) {
        this._content = change.text;
        this._lineOffsets = void 0;
      } else {
        throw new Error("Unknown change event received");
      }
    }
    this._version = version;
  }
  getLineOffsets() {
    if (this._lineOffsets === void 0) {
      this._lineOffsets = computeLineOffsets(this._content, true);
    }
    return this._lineOffsets;
  }
  positionAt(offset) {
    offset = Math.max(Math.min(offset, this._content.length), 0);
    const lineOffsets = this.getLineOffsets();
    let low = 0, high = lineOffsets.length;
    if (high === 0) {
      return { line: 0, character: offset };
    }
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (lineOffsets[mid] > offset) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    const line = low - 1;
    offset = this.ensureBeforeEOL(offset, lineOffsets[line]);
    return { line, character: offset - lineOffsets[line] };
  }
  offsetAt(position) {
    const lineOffsets = this.getLineOffsets();
    if (position.line >= lineOffsets.length) {
      return this._content.length;
    } else if (position.line < 0) {
      return 0;
    }
    const lineOffset = lineOffsets[position.line];
    if (position.character <= 0) {
      return lineOffset;
    }
    const nextLineOffset = position.line + 1 < lineOffsets.length ? lineOffsets[position.line + 1] : this._content.length;
    const offset = Math.min(lineOffset + position.character, nextLineOffset);
    return this.ensureBeforeEOL(offset, lineOffset);
  }
  ensureBeforeEOL(offset, lineOffset) {
    while (offset > lineOffset && isEOL(this._content.charCodeAt(offset - 1))) {
      offset--;
    }
    return offset;
  }
  get lineCount() {
    return this.getLineOffsets().length;
  }
  static isIncremental(event) {
    const candidate = event;
    return candidate !== void 0 && candidate !== null && typeof candidate.text === "string" && candidate.range !== void 0 && (candidate.rangeLength === void 0 || typeof candidate.rangeLength === "number");
  }
  static isFull(event) {
    const candidate = event;
    return candidate !== void 0 && candidate !== null && typeof candidate.text === "string" && candidate.range === void 0 && candidate.rangeLength === void 0;
  }
};
var TextDocument;
(function(TextDocument2) {
  function create(uri, languageId, version, content) {
    return new FullTextDocument(uri, languageId, version, content);
  }
  TextDocument2.create = create;
  function update(document, changes, version) {
    if (document instanceof FullTextDocument) {
      document.update(changes, version);
      return document;
    } else {
      throw new Error("TextDocument.update: document must be created by TextDocument.create");
    }
  }
  TextDocument2.update = update;
  function applyEdits(document, edits) {
    const text = document.getText();
    const sortedEdits = mergeSort(edits.map(getWellformedEdit), (a, b) => {
      const diff = a.range.start.line - b.range.start.line;
      if (diff === 0) {
        return a.range.start.character - b.range.start.character;
      }
      return diff;
    });
    let lastModifiedOffset = 0;
    const spans = [];
    for (const e of sortedEdits) {
      const startOffset = document.offsetAt(e.range.start);
      if (startOffset < lastModifiedOffset) {
        throw new Error("Overlapping edit");
      } else if (startOffset > lastModifiedOffset) {
        spans.push(text.substring(lastModifiedOffset, startOffset));
      }
      if (e.newText.length) {
        spans.push(e.newText);
      }
      lastModifiedOffset = document.offsetAt(e.range.end);
    }
    spans.push(text.substr(lastModifiedOffset));
    return spans.join("");
  }
  TextDocument2.applyEdits = applyEdits;
})(TextDocument || (TextDocument = {}));
function mergeSort(data, compare) {
  if (data.length <= 1) {
    return data;
  }
  const p = data.length / 2 | 0;
  const left = data.slice(0, p);
  const right = data.slice(p);
  mergeSort(left, compare);
  mergeSort(right, compare);
  let leftIdx = 0;
  let rightIdx = 0;
  let i = 0;
  while (leftIdx < left.length && rightIdx < right.length) {
    const ret = compare(left[leftIdx], right[rightIdx]);
    if (ret <= 0) {
      data[i++] = left[leftIdx++];
    } else {
      data[i++] = right[rightIdx++];
    }
  }
  while (leftIdx < left.length) {
    data[i++] = left[leftIdx++];
  }
  while (rightIdx < right.length) {
    data[i++] = right[rightIdx++];
  }
  return data;
}
function computeLineOffsets(text, isAtLineStart, textOffset = 0) {
  const result = isAtLineStart ? [textOffset] : [];
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (isEOL(ch)) {
      if (ch === 13 && i + 1 < text.length && text.charCodeAt(i + 1) === 10) {
        i++;
      }
      result.push(textOffset + i + 1);
    }
  }
  return result;
}
function isEOL(char) {
  return char === 13 || char === 10;
}
function getWellformedRange(range) {
  const start = range.start;
  const end = range.end;
  if (start.line > end.line || start.line === end.line && start.character > end.character) {
    return { start: end, end: start };
  }
  return range;
}
function getWellformedEdit(textEdit) {
  const range = getWellformedRange(textEdit.range);
  if (range !== textEdit.range) {
    return { newText: textEdit.newText, range };
  }
  return textEdit;
}

// ../../src/lsp/server.ts
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var import_url = require("url");

// ../../src/diagnostics/index.ts
function formatSourcePointer(sourceLines, line, col) {
  const lineIdx = line - 1;
  if (lineIdx < 0 || lineIdx >= sourceLines.length) {
    return [];
  }
  const sourceLine = sourceLines[lineIdx];
  const safeCol = Math.max(1, Math.min(col, sourceLine.length + 1));
  const pointer = `  ${" ".repeat(safeCol - 1)}^`;
  return [`  ${sourceLine}`, pointer];
}
var DiagnosticError = class extends Error {
  constructor(kind, message, location, sourceLines) {
    super(message);
    this.name = "DiagnosticError";
    this.kind = kind;
    this.location = location;
    this.sourceLines = sourceLines;
  }
  /**
   * Format the error for display:
   * ```
   * Error: [ParseError] line 5, col 12: Expected ';' after statement
   *   5 |   let x = 42
   *                   ^ expected ';'
   * ```
   */
  format() {
    const { kind, message, location, sourceLines } = this;
    const filePart = location.file ? `${location.file}:` : "";
    const header = `Error: [${kind}] ${filePart}line ${location.line}, col ${location.col}: ${message}`;
    if (!sourceLines || sourceLines.length === 0) {
      return header;
    }
    const pointerLines = formatSourcePointer(sourceLines, location.line, location.col);
    if (pointerLines.length === 0) {
      return header;
    }
    const lineNum = String(location.line).padStart(3);
    const prefix = `${lineNum} | `;
    const sourceLine = sourceLines[location.line - 1];
    const safeCol = Math.max(1, Math.min(location.col, sourceLine.length + 1));
    const pointer = " ".repeat(prefix.length + safeCol - 1) + "^";
    const hint = message.toLowerCase().includes("expected") ? message.split(":").pop()?.trim() || "" : "";
    return [
      header,
      `${prefix}${sourceLine}`,
      `${pointer}${hint ? ` ${hint}` : ""}`
    ].join("\n");
  }
  toString() {
    return this.format();
  }
};
var DiagnosticCollector = class {
  constructor(source, filePath) {
    this.diagnostics = [];
    this.sourceLines = [];
    if (source) {
      this.sourceLines = source.split("\n");
    }
    this.filePath = filePath;
  }
  error(kind, message, line, col) {
    const diagnostic = new DiagnosticError(
      kind,
      message,
      { file: this.filePath, line, col },
      this.sourceLines
    );
    this.diagnostics.push(diagnostic);
  }
  hasErrors() {
    return this.diagnostics.length > 0;
  }
  getErrors() {
    return this.diagnostics;
  }
  formatAll() {
    return this.diagnostics.map((d) => d.format()).join("\n\n");
  }
  throwFirst() {
    if (this.diagnostics.length > 0) {
      throw this.diagnostics[0];
    }
    throw new Error("No diagnostics to throw");
  }
};

// ../../src/lexer/index.ts
var KEYWORDS = {
  fn: "fn",
  let: "let",
  const: "const",
  if: "if",
  else: "else",
  while: "while",
  for: "for",
  foreach: "foreach",
  match: "match",
  return: "return",
  break: "break",
  continue: "continue",
  as: "as",
  at: "at",
  in: "in",
  is: "is",
  struct: "struct",
  impl: "impl",
  enum: "enum",
  trigger: "trigger",
  namespace: "namespace",
  module: "module",
  execute: "execute",
  run: "run",
  unless: "unless",
  declare: "declare",
  export: "export",
  import: "import",
  int: "int",
  bool: "bool",
  float: "float",
  fixed: "fixed",
  string: "string",
  void: "void",
  BlockPos: "BlockPos",
  true: "true",
  false: "false"
};
var SELECTOR_CHARS = /* @__PURE__ */ new Set(["a", "e", "s", "p", "r", "n"]);
var Lexer = class {
  constructor(source, filePath) {
    this.pos = 0;
    this.line = 1;
    this.col = 1;
    this.tokens = [];
    this.source = source;
    this.sourceLines = source.split("\n");
    this.filePath = filePath;
  }
  error(message, line, col) {
    throw new DiagnosticError(
      "LexError",
      message,
      { file: this.filePath, line: line ?? this.line, col: col ?? this.col },
      this.sourceLines
    );
  }
  tokenize() {
    while (!this.isAtEnd()) {
      this.scanToken();
    }
    this.tokens.push({ kind: "eof", value: "", line: this.line, col: this.col });
    return this.tokens;
  }
  isAtEnd() {
    return this.pos >= this.source.length;
  }
  peek(offset = 0) {
    const idx = this.pos + offset;
    if (idx >= this.source.length) return "\0";
    return this.source[idx];
  }
  advance() {
    const char = this.source[this.pos++];
    if (char === "\n") {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return char;
  }
  addToken(kind, value, line, col) {
    this.tokens.push({ kind, value, line, col });
  }
  scanToken() {
    const startLine = this.line;
    const startCol = this.col;
    const char = this.advance();
    if (/\s/.test(char)) return;
    if (char === "/" && this.peek() === "/") {
      while (!this.isAtEnd() && this.peek() !== "\n") {
        this.advance();
      }
      return;
    }
    if (char === "/" && this.peek() === "*") {
      this.advance();
      while (!this.isAtEnd()) {
        if (this.peek() === "*" && this.peek(1) === "/") {
          this.advance();
          this.advance();
          break;
        }
        this.advance();
      }
      return;
    }
    if (char === "-" && this.peek() === ">") {
      this.advance();
      this.addToken("->", "->", startLine, startCol);
      return;
    }
    if (char === "=" && this.peek() === ">") {
      this.advance();
      this.addToken("=>", "=>", startLine, startCol);
      return;
    }
    if (char === "=" && this.peek() === "=") {
      this.advance();
      this.addToken("==", "==", startLine, startCol);
      return;
    }
    if (char === "!" && this.peek() === "=") {
      this.advance();
      this.addToken("!=", "!=", startLine, startCol);
      return;
    }
    if (char === "<" && this.peek() === "=") {
      this.advance();
      this.addToken("<=", "<=", startLine, startCol);
      return;
    }
    if (char === ">" && this.peek() === "=") {
      this.advance();
      this.addToken(">=", ">=", startLine, startCol);
      return;
    }
    if (char === "&" && this.peek() === "&") {
      this.advance();
      this.addToken("&&", "&&", startLine, startCol);
      return;
    }
    if (char === "|" && this.peek() === "|") {
      this.advance();
      this.addToken("||", "||", startLine, startCol);
      return;
    }
    if (char === "+" && this.peek() === "=") {
      this.advance();
      this.addToken("+=", "+=", startLine, startCol);
      return;
    }
    if (char === "-" && this.peek() === "=") {
      this.advance();
      this.addToken("-=", "-=", startLine, startCol);
      return;
    }
    if (char === "*" && this.peek() === "=") {
      this.advance();
      this.addToken("*=", "*=", startLine, startCol);
      return;
    }
    if (char === "/" && this.peek() === "=") {
      this.advance();
      this.addToken("/=", "/=", startLine, startCol);
      return;
    }
    if (char === "%" && this.peek() === "=") {
      this.advance();
      this.addToken("%=", "%=", startLine, startCol);
      return;
    }
    if (char === ":" && this.peek() === ":") {
      this.advance();
      this.addToken("::", "::", startLine, startCol);
      return;
    }
    if (char === "." && this.peek() === ".") {
      this.advance();
      let value = "..";
      if (this.peek() === "=") {
        value += this.advance();
      }
      while (/[0-9]/.test(this.peek())) {
        value += this.advance();
      }
      this.addToken("range_lit", value, startLine, startCol);
      return;
    }
    if (char === "~") {
      let value = "~";
      if (this.peek() === "-" || this.peek() === "+") {
        value += this.advance();
      }
      while (/[0-9]/.test(this.peek())) {
        value += this.advance();
      }
      if (this.peek() === "." && /[0-9]/.test(this.peek(1))) {
        value += this.advance();
        while (/[0-9]/.test(this.peek())) {
          value += this.advance();
        }
      }
      if (/[a-zA-Z_]/.test(this.peek())) {
        let ident = "";
        while (/[a-zA-Z0-9_]/.test(this.peek())) {
          ident += this.advance();
        }
        value += ident;
      }
      this.addToken("rel_coord", value, startLine, startCol);
      return;
    }
    if (char === "^") {
      let value = "^";
      if (/[a-zA-Z_]/.test(this.peek())) {
        while (/[a-zA-Z0-9_]/.test(this.peek())) {
          value += this.advance();
        }
        this.addToken("local_coord", value, startLine, startCol);
        return;
      }
      if (this.peek() === "-" || this.peek() === "+") {
        value += this.advance();
      }
      while (/[0-9]/.test(this.peek())) {
        value += this.advance();
      }
      if (this.peek() === "." && /[0-9]/.test(this.peek(1))) {
        value += this.advance();
        while (/[0-9]/.test(this.peek())) {
          value += this.advance();
        }
      }
      this.addToken("local_coord", value, startLine, startCol);
      return;
    }
    const singleChar = [
      "+",
      "-",
      "*",
      "/",
      "%",
      "<",
      ">",
      "!",
      "=",
      "{",
      "}",
      "(",
      ")",
      "[",
      "]",
      ",",
      ";",
      ":",
      "."
    ];
    if (singleChar.includes(char)) {
      this.addToken(char, char, startLine, startCol);
      return;
    }
    if (char === "@") {
      this.scanAtToken(startLine, startCol);
      return;
    }
    if (char === "f" && this.peek() === '"') {
      this.advance();
      this.scanFString(startLine, startCol);
      return;
    }
    if (char === '"') {
      this.scanString(startLine, startCol);
      return;
    }
    if (char === "#") {
      const nextChar = this.peek();
      if (/[a-zA-Z_]/.test(nextChar)) {
        let name = "#";
        while (/[a-zA-Z0-9_]/.test(this.peek())) {
          name += this.advance();
        }
        this.addToken("mc_name", name, startLine, startCol);
        return;
      }
      this.error(`Unexpected character '#'`, startLine, startCol);
      return;
    }
    if (/[0-9]/.test(char)) {
      this.scanNumber(char, startLine, startCol);
      return;
    }
    if (/[a-zA-Z_]/.test(char)) {
      this.scanIdentifier(char, startLine, startCol);
      return;
    }
    this.error(`Unexpected character '${char}'`, startLine, startCol);
  }
  scanAtToken(startLine, startCol) {
    const nextChar = this.peek();
    const afterNext = this.peek(1);
    if (SELECTOR_CHARS.has(nextChar) && !/[a-zA-Z_0-9]/.test(afterNext)) {
      const selectorChar = this.advance();
      let value2 = "@" + selectorChar;
      if (this.peek() === "[") {
        value2 += this.scanSelectorParams();
      }
      this.addToken("selector", value2, startLine, startCol);
      return;
    }
    let value = "@";
    while (/[a-zA-Z_0-9]/.test(this.peek())) {
      value += this.advance();
    }
    if (this.peek() === "(") {
      value += this.advance();
      let parenDepth = 1;
      while (!this.isAtEnd() && parenDepth > 0) {
        const c = this.advance();
        value += c;
        if (c === "(") parenDepth++;
        if (c === ")") parenDepth--;
      }
    }
    this.addToken("decorator", value, startLine, startCol);
  }
  scanSelectorParams() {
    let result = this.advance();
    let depth = 1;
    let braceDepth = 0;
    while (!this.isAtEnd() && depth > 0) {
      const c = this.advance();
      result += c;
      if (c === "{") braceDepth++;
      else if (c === "}") braceDepth--;
      else if (c === "[" && braceDepth === 0) depth++;
      else if (c === "]" && braceDepth === 0) depth--;
    }
    return result;
  }
  scanString(startLine, startCol) {
    let value = "";
    let interpolationDepth = 0;
    let interpolationString = false;
    while (!this.isAtEnd()) {
      if (interpolationDepth === 0 && this.peek() === '"') {
        break;
      }
      if (this.peek() === "\\" && this.peek(1) === '"') {
        this.advance();
        value += this.advance();
        continue;
      }
      if (interpolationDepth === 0 && this.peek() === "$" && this.peek(1) === "{") {
        value += this.advance();
        value += this.advance();
        interpolationDepth = 1;
        interpolationString = false;
        continue;
      }
      const char = this.advance();
      value += char;
      if (interpolationDepth === 0) continue;
      if (char === '"') {
        interpolationString = !interpolationString;
        continue;
      }
      if (interpolationString) continue;
      if (char === "{") interpolationDepth++;
      if (char === "}") interpolationDepth--;
    }
    if (this.isAtEnd()) {
      this.error(`Unterminated string`, startLine, startCol);
    }
    this.advance();
    this.addToken("string_lit", value, startLine, startCol);
  }
  scanFString(startLine, startCol) {
    let value = "";
    let interpolationDepth = 0;
    let interpolationString = false;
    while (!this.isAtEnd()) {
      if (interpolationDepth === 0 && this.peek() === '"') {
        break;
      }
      if (this.peek() === "\\" && this.peek(1) === '"') {
        this.advance();
        value += this.advance();
        continue;
      }
      if (interpolationDepth === 0 && this.peek() === "{") {
        value += this.advance();
        interpolationDepth = 1;
        interpolationString = false;
        continue;
      }
      const char = this.advance();
      value += char;
      if (interpolationDepth === 0) continue;
      if (char === '"' && this.source[this.pos - 2] !== "\\") {
        interpolationString = !interpolationString;
        continue;
      }
      if (interpolationString) continue;
      if (char === "{") interpolationDepth++;
      if (char === "}") interpolationDepth--;
    }
    if (this.isAtEnd()) {
      this.error("Unterminated f-string", startLine, startCol);
    }
    this.advance();
    this.addToken("f_string", value, startLine, startCol);
  }
  scanNumber(firstChar, startLine, startCol) {
    let value = firstChar;
    while (/[0-9]/.test(this.peek())) {
      value += this.advance();
    }
    if (this.peek() === "." && this.peek(1) === ".") {
      value += this.advance();
      value += this.advance();
      if (this.peek() === "=") {
        value += this.advance();
      }
      while (/[0-9]/.test(this.peek())) {
        value += this.advance();
      }
      this.addToken("range_lit", value, startLine, startCol);
      return;
    }
    if (this.peek() === "." && /[0-9]/.test(this.peek(1))) {
      value += this.advance();
      while (/[0-9]/.test(this.peek())) {
        value += this.advance();
      }
      const floatSuffix = this.peek().toLowerCase();
      if (floatSuffix === "f") {
        value += this.advance();
        this.addToken("float_lit", value, startLine, startCol);
        return;
      }
      if (floatSuffix === "d") {
        value += this.advance();
        this.addToken("double_lit", value, startLine, startCol);
        return;
      }
      this.addToken("float_lit", value, startLine, startCol);
      return;
    }
    const intSuffix = this.peek().toLowerCase();
    if (intSuffix === "b" && !/[a-zA-Z_0-9]/.test(this.peek(1))) {
      value += this.advance();
      this.addToken("byte_lit", value, startLine, startCol);
      return;
    }
    if (intSuffix === "s" && !/[a-zA-Z_0-9]/.test(this.peek(1))) {
      value += this.advance();
      this.addToken("short_lit", value, startLine, startCol);
      return;
    }
    if (intSuffix === "l" && !/[a-zA-Z_0-9]/.test(this.peek(1))) {
      value += this.advance();
      this.addToken("long_lit", value, startLine, startCol);
      return;
    }
    if (intSuffix === "f" && !/[a-zA-Z_0-9]/.test(this.peek(1))) {
      value += this.advance();
      this.addToken("float_lit", value, startLine, startCol);
      return;
    }
    if (intSuffix === "d" && !/[a-zA-Z_0-9]/.test(this.peek(1))) {
      value += this.advance();
      this.addToken("double_lit", value, startLine, startCol);
      return;
    }
    this.addToken("int_lit", value, startLine, startCol);
  }
  scanIdentifier(firstChar, startLine, startCol) {
    let value = firstChar;
    while (/[a-zA-Z_0-9]/.test(this.peek())) {
      value += this.advance();
    }
    if (value === "raw" && this.peek() === "(") {
      this.advance();
      while (/\s/.test(this.peek())) {
        this.advance();
      }
      if (this.peek() === '"') {
        this.advance();
        let rawContent = "";
        while (!this.isAtEnd() && this.peek() !== '"') {
          if (this.peek() === "\\" && this.peek(1) === '"') {
            this.advance();
            rawContent += this.advance();
          } else {
            rawContent += this.advance();
          }
        }
        if (this.peek() === '"') {
          this.advance();
        }
        while (/\s/.test(this.peek())) {
          this.advance();
        }
        if (this.peek() === ")") {
          this.advance();
        }
        this.addToken("raw_cmd", rawContent, startLine, startCol);
        return;
      }
    }
    const keyword = KEYWORDS[value];
    if (keyword) {
      this.addToken(keyword, value, startLine, startCol);
    } else {
      this.addToken("ident", value, startLine, startCol);
    }
  }
};

// ../../src/parser/index.ts
var PRECEDENCE = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "is": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6
};
var BINARY_OPS = /* @__PURE__ */ new Set(["||", "&&", "==", "!=", "<", "<=", ">", ">=", "is", "+", "-", "*", "/", "%"]);
var ENTITY_TYPE_NAMES = /* @__PURE__ */ new Set([
  "entity",
  "Player",
  "Mob",
  "HostileMob",
  "PassiveMob",
  "Zombie",
  "Skeleton",
  "Creeper",
  "Spider",
  "Enderman",
  "Blaze",
  "Witch",
  "Slime",
  "ZombieVillager",
  "Husk",
  "Drowned",
  "Stray",
  "WitherSkeleton",
  "CaveSpider",
  "Pig",
  "Cow",
  "Sheep",
  "Chicken",
  "Villager",
  "WanderingTrader",
  "ArmorStand",
  "Item",
  "Arrow"
]);
function computeIsSingle(raw) {
  if (/^@[spr](\[|$)/.test(raw)) return true;
  if (/[\[,\s]limit=1[,\]\s]/.test(raw)) return true;
  return false;
}
var Parser = class _Parser {
  constructor(tokens, source, filePath) {
    this.pos = 0;
    /** Set to true once `module library;` is seen — all subsequent fn declarations
     *  will be marked isLibraryFn=true.  When library sources are parsed via the
     *  `librarySources` compile option, each source is parsed by its own fresh
     *  Parser instance, so this flag never bleeds into user code. */
    this.inLibraryMode = false;
    /** Warnings accumulated during parsing (e.g. deprecated keyword usage). */
    this.warnings = [];
    this.tokens = tokens;
    this.sourceLines = source?.split("\n") ?? [];
    this.filePath = filePath;
  }
  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------
  peek(offset = 0) {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1];
    }
    return this.tokens[idx];
  }
  advance() {
    const token = this.tokens[this.pos];
    if (token.kind !== "eof") this.pos++;
    return token;
  }
  check(kind) {
    return this.peek().kind === kind;
  }
  match(...kinds) {
    for (const kind of kinds) {
      if (this.check(kind)) {
        this.advance();
        return true;
      }
    }
    return false;
  }
  expect(kind) {
    const token = this.peek();
    if (token.kind !== kind) {
      throw new DiagnosticError(
        "ParseError",
        `Expected '${kind}' but got '${token.kind}'`,
        { file: this.filePath, line: token.line, col: token.col },
        this.sourceLines
      );
    }
    return this.advance();
  }
  error(message) {
    const token = this.peek();
    throw new DiagnosticError(
      "ParseError",
      message,
      { file: this.filePath, line: token.line, col: token.col },
      this.sourceLines
    );
  }
  withLoc(node, token) {
    const span = { line: token.line, col: token.col };
    Object.defineProperty(node, "span", {
      value: span,
      enumerable: false,
      configurable: true,
      writable: true
    });
    return node;
  }
  getLocToken(node) {
    const span = node.span;
    if (!span) {
      return null;
    }
    return { kind: "eof", value: "", line: span.line, col: span.col };
  }
  // -------------------------------------------------------------------------
  // Program
  // -------------------------------------------------------------------------
  parse(defaultNamespace = "redscript") {
    let namespace = defaultNamespace;
    const globals = [];
    const declarations = [];
    const structs = [];
    const implBlocks = [];
    const enums = [];
    const consts = [];
    const imports = [];
    let isLibrary = false;
    let moduleName;
    if (this.check("namespace")) {
      this.advance();
      const name = this.expect("ident");
      namespace = name.value;
      this.match(";");
    }
    if (this.check("module")) {
      this.advance();
      const modKind = this.expect("ident");
      if (modKind.value === "library") {
        isLibrary = true;
        this.inLibraryMode = true;
      } else {
        moduleName = modKind.value;
      }
      this.match(";");
    }
    while (!this.check("eof")) {
      if (this.check("let")) {
        globals.push(this.parseGlobalDecl(true));
      } else if (this.check("struct")) {
        structs.push(this.parseStructDecl());
      } else if (this.check("impl")) {
        implBlocks.push(this.parseImplBlock());
      } else if (this.check("enum")) {
        enums.push(this.parseEnumDecl());
      } else if (this.check("const")) {
        consts.push(this.parseConstDecl());
      } else if (this.check("declare")) {
        this.advance();
        this.parseDeclareStub();
      } else if (this.check("export")) {
        declarations.push(this.parseExportedFnDecl());
      } else if (this.check("import") || this.check("ident") && this.peek().value === "import") {
        this.advance();
        const importToken = this.peek();
        const modName = this.expect("ident").value;
        if (this.check("::")) {
          this.advance();
          let symbol;
          if (this.check("*")) {
            this.advance();
            symbol = "*";
          } else {
            symbol = this.expect("ident").value;
          }
          this.match(";");
          imports.push(this.withLoc({ moduleName: modName, symbol }, importToken));
        } else {
          this.match(";");
          imports.push(this.withLoc({ moduleName: modName, symbol: void 0 }, importToken));
        }
      } else {
        declarations.push(this.parseFnDecl());
      }
    }
    return { namespace, moduleName, globals, declarations, structs, implBlocks, enums, consts, imports, isLibrary };
  }
  // -------------------------------------------------------------------------
  // Struct Declaration
  // -------------------------------------------------------------------------
  parseStructDecl() {
    const structToken = this.expect("struct");
    const name = this.expect("ident").value;
    this.expect("{");
    const fields = [];
    while (!this.check("}") && !this.check("eof")) {
      const fieldName = this.expect("ident").value;
      this.expect(":");
      const fieldType = this.parseType();
      fields.push({ name: fieldName, type: fieldType });
      this.match(",");
    }
    this.expect("}");
    return this.withLoc({ name, fields }, structToken);
  }
  parseEnumDecl() {
    const enumToken = this.expect("enum");
    const name = this.expect("ident").value;
    this.expect("{");
    const variants = [];
    let nextValue = 0;
    while (!this.check("}") && !this.check("eof")) {
      const variantToken = this.expect("ident");
      const variant = { name: variantToken.value };
      if (this.check("(")) {
        this.advance();
        const fields = [];
        while (!this.check(")") && !this.check("eof")) {
          const fieldName = this.expect("ident").value;
          this.expect(":");
          const fieldType = this.parseType();
          fields.push({ name: fieldName, type: fieldType });
          if (!this.match(",")) break;
        }
        this.expect(")");
        variant.fields = fields;
      }
      if (this.match("=")) {
        const valueToken = this.expect("int_lit");
        variant.value = parseInt(valueToken.value, 10);
        nextValue = variant.value + 1;
      } else {
        variant.value = nextValue++;
      }
      variants.push(variant);
      if (!this.match(",")) {
        break;
      }
    }
    this.expect("}");
    return this.withLoc({ name, variants }, enumToken);
  }
  parseImplBlock() {
    const implToken = this.expect("impl");
    const typeName = this.expect("ident").value;
    this.expect("{");
    const methods = [];
    while (!this.check("}") && !this.check("eof")) {
      methods.push(this.parseFnDecl(typeName));
    }
    this.expect("}");
    return this.withLoc({ kind: "impl_block", typeName, methods }, implToken);
  }
  parseConstDecl() {
    const constToken = this.expect("const");
    const name = this.expect("ident").value;
    let type;
    if (this.match(":")) {
      type = this.parseType();
    }
    this.expect("=");
    const value = this.parseLiteralExpr();
    this.match(";");
    const inferredType = type ?? (value.kind === "str_lit" ? { kind: "named", name: "string" } : value.kind === "bool_lit" ? { kind: "named", name: "bool" } : value.kind === "float_lit" ? { kind: "named", name: "fixed" } : { kind: "named", name: "int" });
    return this.withLoc({ name, type: inferredType, value }, constToken);
  }
  parseGlobalDecl(mutable) {
    const token = this.advance();
    const name = this.expect("ident").value;
    this.expect(":");
    const type = this.parseType();
    this.expect("=");
    const init = this.parseExpr();
    this.match(";");
    return this.withLoc({ kind: "global", name, type, init, mutable }, token);
  }
  // -------------------------------------------------------------------------
  // Function Declaration
  // -------------------------------------------------------------------------
  /** Parse `export fn name(...)` — marks the function as exported (survives DCE). */
  parseExportedFnDecl() {
    this.expect("export");
    const fn = this.parseFnDecl();
    fn.isExported = true;
    return fn;
  }
  parseFnDecl(implTypeName) {
    const decorators = this.parseDecorators();
    let isExported;
    const filteredDecorators = decorators.filter((d) => {
      if (d.name === "keep") {
        isExported = true;
        return false;
      }
      return true;
    });
    const fnToken = this.expect("fn");
    const name = this.expect("ident").value;
    let typeParams;
    if (this.check("<")) {
      this.advance();
      typeParams = [];
      do {
        typeParams.push(this.expect("ident").value);
      } while (this.match(","));
      this.expect(">");
    }
    this.expect("(");
    const params = this.parseParams(implTypeName);
    this.expect(")");
    let returnType = { kind: "named", name: "void" };
    if (this.match("->") || this.match(":")) {
      returnType = this.parseType();
    }
    const body = this.parseBlock();
    const closingBraceLine = this.tokens[this.pos - 1]?.line;
    const fn = this.withLoc(
      {
        name,
        typeParams,
        params,
        returnType,
        decorators: filteredDecorators,
        body,
        isLibraryFn: this.inLibraryMode || void 0,
        isExported
      },
      fnToken
    );
    if (fn.span && closingBraceLine) fn.span.endLine = closingBraceLine;
    return fn;
  }
  /** Parse a `declare fn name(params): returnType;` stub — no body, just discard. */
  parseDeclareStub() {
    this.expect("fn");
    this.expect("ident");
    this.expect("(");
    let depth = 1;
    while (!this.check("eof") && depth > 0) {
      const t = this.advance();
      if (t.kind === "(") depth++;
      else if (t.kind === ")") depth--;
    }
    if (this.match(":") || this.match("->")) {
      this.parseType();
    }
    this.match(";");
  }
  parseDecorators() {
    const decorators = [];
    while (this.check("decorator")) {
      const token = this.advance();
      const decorator = this.parseDecoratorValue(token.value);
      decorators.push(decorator);
    }
    return decorators;
  }
  parseDecoratorValue(value) {
    const match = value.match(/^@(\w+)(?:\(([^)]*)\))?$/);
    if (!match) {
      this.error(`Invalid decorator: ${value}`);
    }
    const name = match[1];
    const argsStr = match[2];
    if (!argsStr) {
      return { name };
    }
    const args = {};
    if (name === "on") {
      const eventTypeMatch = argsStr.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
      if (eventTypeMatch) {
        args.eventType = eventTypeMatch[1];
        return { name, args };
      }
    }
    if (name === "on_trigger" || name === "on_advancement" || name === "on_craft" || name === "on_join_team") {
      const strMatch = argsStr.match(/^"([^"]*)"$/);
      if (strMatch) {
        if (name === "on_trigger") {
          args.trigger = strMatch[1];
        } else if (name === "on_advancement") {
          args.advancement = strMatch[1];
        } else if (name === "on_craft") {
          args.item = strMatch[1];
        } else if (name === "on_join_team") {
          args.team = strMatch[1];
        }
        return { name, args };
      }
    }
    if (name === "require_on_load") {
      const rawArgs = [];
      for (const part of argsStr.split(",")) {
        const trimmed = part.trim();
        const identMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
        if (identMatch) {
          rawArgs.push({ kind: "string", value: identMatch[1] });
        } else {
          const strMatch = trimmed.match(/^"([^"]*)"$/);
          if (strMatch) {
            rawArgs.push({ kind: "string", value: strMatch[1] });
          }
        }
      }
      return { name, rawArgs };
    }
    for (const part of argsStr.split(",")) {
      const [key, val] = part.split("=").map((s) => s.trim());
      if (key === "rate") {
        args.rate = parseInt(val, 10);
      } else if (key === "ticks") {
        args.ticks = parseInt(val, 10);
      } else if (key === "batch") {
        args.batch = parseInt(val, 10);
      } else if (key === "onDone") {
        args.onDone = val.replace(/^["']|["']$/g, "");
      } else if (key === "trigger") {
        args.trigger = val;
      } else if (key === "advancement") {
        args.advancement = val;
      } else if (key === "item") {
        args.item = val;
      } else if (key === "team") {
        args.team = val;
      }
    }
    return { name, args };
  }
  parseParams(implTypeName) {
    const params = [];
    if (!this.check(")")) {
      do {
        const paramToken = this.expect("ident");
        const name = paramToken.value;
        let type;
        if (implTypeName && params.length === 0 && name === "self" && !this.check(":")) {
          type = { kind: "struct", name: implTypeName };
        } else {
          this.expect(":");
          type = this.parseType();
        }
        let defaultValue;
        if (this.match("=")) {
          defaultValue = this.parseExpr();
        }
        params.push(this.withLoc({ name, type, default: defaultValue }, paramToken));
      } while (this.match(","));
    }
    return params;
  }
  parseType() {
    const token = this.peek();
    let type;
    if (token.kind === "(") {
      const saved = this.pos;
      this.advance();
      const elements = [];
      if (!this.check(")")) {
        do {
          elements.push(this.parseType());
        } while (this.match(","));
      }
      this.expect(")");
      if (this.check("->")) {
        this.pos = saved;
        return this.parseFunctionType();
      }
      return { kind: "tuple", elements };
    }
    if (token.kind === "float") {
      this.advance();
      const filePart = this.filePath ? `${this.filePath}:` : "";
      this.warnings.push(
        `[DeprecatedType] ${filePart}line ${token.line}, col ${token.col}: 'float' is deprecated, use 'fixed' instead (\xD710000 fixed-point)`
      );
      type = { kind: "named", name: "float" };
    } else if (token.kind === "int" || token.kind === "bool" || token.kind === "fixed" || token.kind === "string" || token.kind === "void" || token.kind === "BlockPos") {
      this.advance();
      type = { kind: "named", name: token.kind };
    } else if (token.kind === "ident") {
      this.advance();
      if (token.value === "selector" && this.check("<")) {
        this.advance();
        const entityType = this.expect("ident").value;
        this.expect(">");
        type = { kind: "selector", entityType };
      } else if (token.value === "selector") {
        type = { kind: "selector" };
      } else if (token.value === "Option" && this.check("<")) {
        this.advance();
        const inner = this.parseType();
        this.expect(">");
        type = { kind: "option", inner };
      } else if (token.value === "double" || token.value === "byte" || token.value === "short" || token.value === "long" || token.value === "format_string") {
        type = { kind: "named", name: token.value };
      } else {
        type = { kind: "struct", name: token.value };
      }
    } else {
      this.error(`Expected type, got '${token.kind}'`);
    }
    while (this.match("[")) {
      this.expect("]");
      type = { kind: "array", elem: type };
    }
    return type;
  }
  parseFunctionType() {
    this.expect("(");
    const params = [];
    if (!this.check(")")) {
      do {
        params.push(this.parseType());
      } while (this.match(","));
    }
    this.expect(")");
    this.expect("->");
    const returnType = this.parseType();
    return { kind: "function_type", params, return: returnType };
  }
  // -------------------------------------------------------------------------
  // Block & Statements
  // -------------------------------------------------------------------------
  parseBlock() {
    this.expect("{");
    const stmts = [];
    while (!this.check("}") && !this.check("eof")) {
      stmts.push(this.parseStmt());
    }
    this.expect("}");
    return stmts;
  }
  parseStmt() {
    if (this.check("let")) {
      return this.parseLetStmt();
    }
    if (this.check("return")) {
      return this.parseReturnStmt();
    }
    if (this.check("break")) {
      const token = this.advance();
      this.match(";");
      return this.withLoc({ kind: "break" }, token);
    }
    if (this.check("continue")) {
      const token = this.advance();
      this.match(";");
      return this.withLoc({ kind: "continue" }, token);
    }
    if (this.check("if")) {
      return this.parseIfStmt();
    }
    if (this.check("while")) {
      return this.parseWhileStmt();
    }
    if (this.check("for")) {
      return this.parseForStmt();
    }
    if (this.check("foreach")) {
      return this.parseForeachStmt();
    }
    if (this.check("match")) {
      return this.parseMatchStmt();
    }
    if (this.check("as")) {
      return this.parseAsStmt();
    }
    if (this.check("at")) {
      return this.parseAtStmt();
    }
    if (this.check("execute")) {
      return this.parseExecuteStmt();
    }
    if (this.check("raw_cmd")) {
      const token = this.advance();
      const cmd = token.value;
      this.match(";");
      return this.withLoc({ kind: "raw", cmd }, token);
    }
    return this.parseExprStmt();
  }
  parseLetStmt() {
    const letToken = this.expect("let");
    if (this.check("(")) {
      this.advance();
      const names = [];
      do {
        names.push(this.expect("ident").value);
      } while (this.match(","));
      this.expect(")");
      let type2;
      if (this.match(":")) {
        type2 = this.parseType();
      }
      this.expect("=");
      const init2 = this.parseExpr();
      this.match(";");
      return this.withLoc({ kind: "let_destruct", names, type: type2, init: init2 }, letToken);
    }
    const name = this.expect("ident").value;
    let type;
    if (this.match(":")) {
      type = this.parseType();
    }
    this.expect("=");
    const init = this.parseExpr();
    this.match(";");
    return this.withLoc({ kind: "let", name, type, init }, letToken);
  }
  parseReturnStmt() {
    const returnToken = this.expect("return");
    let value;
    if (!this.check(";") && !this.check("}") && !this.check("eof")) {
      value = this.parseExpr();
    }
    this.match(";");
    return this.withLoc({ kind: "return", value }, returnToken);
  }
  parseIfStmt() {
    const ifToken = this.expect("if");
    if (this.check("let") && this.peek(1).kind === "ident" && this.peek(1).value === "Some") {
      this.advance();
      this.advance();
      this.expect("(");
      const binding = this.expect("ident").value;
      this.expect(")");
      this.expect("=");
      const init = this.parseExpr();
      const then2 = this.parseBlock();
      let else_2;
      if (this.match("else")) {
        if (this.check("if")) {
          else_2 = [this.parseIfStmt()];
        } else {
          else_2 = this.parseBlock();
        }
      }
      return this.withLoc({ kind: "if_let_some", binding, init, then: then2, else_: else_2 }, ifToken);
    }
    this.expect("(");
    const cond = this.parseExpr();
    this.expect(")");
    const then = this.parseBlock();
    let else_;
    if (this.match("else")) {
      if (this.check("if")) {
        else_ = [this.parseIfStmt()];
      } else {
        else_ = this.parseBlock();
      }
    }
    return this.withLoc({ kind: "if", cond, then, else_ }, ifToken);
  }
  parseWhileStmt() {
    const whileToken = this.expect("while");
    if (this.check("let") && this.peek(1).kind === "ident" && this.peek(1).value === "Some") {
      this.advance();
      this.advance();
      this.expect("(");
      const binding = this.expect("ident").value;
      this.expect(")");
      this.expect("=");
      const init = this.parseExpr();
      const body2 = this.parseBlock();
      return this.withLoc({ kind: "while_let_some", binding, init, body: body2 }, whileToken);
    }
    this.expect("(");
    const cond = this.parseExpr();
    this.expect(")");
    const body = this.parseBlock();
    return this.withLoc({ kind: "while", cond, body }, whileToken);
  }
  parseForStmt() {
    const forToken = this.expect("for");
    if (this.check("ident") && this.peek(1).kind === "in") {
      return this.parseForRangeStmt(forToken);
    }
    this.expect("(");
    if (this.check("let") && this.peek(1).kind === "ident" && this.peek(2).kind === "in" && this.peek(3).kind === "ident" && this.peek(4).kind === ",") {
      this.advance();
      const binding = this.expect("ident").value;
      this.expect("in");
      const arrayName = this.expect("ident").value;
      this.expect(",");
      const lenExpr = this.parseExpr();
      this.expect(")");
      const body2 = this.parseBlock();
      return this.withLoc({ kind: "for_in_array", binding, arrayName, lenExpr, body: body2 }, forToken);
    }
    let init;
    if (this.check("let")) {
      const letToken = this.expect("let");
      const name = this.expect("ident").value;
      let type;
      if (this.match(":")) {
        type = this.parseType();
      }
      this.expect("=");
      const initExpr = this.parseExpr();
      const initStmt = { kind: "let", name, type, init: initExpr };
      init = this.withLoc(initStmt, letToken);
    }
    this.expect(";");
    const cond = this.parseExpr();
    this.expect(";");
    const step = this.parseExpr();
    this.expect(")");
    const body = this.parseBlock();
    return this.withLoc({ kind: "for", init, cond, step, body }, forToken);
  }
  parseForRangeStmt(forToken) {
    const varName = this.expect("ident").value;
    this.expect("in");
    let start;
    let end;
    let inclusive = false;
    if (this.check("range_lit")) {
      const rangeToken = this.advance();
      const raw = rangeToken.value;
      const incl = raw.includes("..=");
      inclusive = incl;
      const range = this.parseRangeValue(raw);
      start = this.withLoc({ kind: "int_lit", value: range.min ?? 0 }, rangeToken);
      if (range.max !== null && range.max !== void 0) {
        end = this.withLoc({ kind: "int_lit", value: range.max }, rangeToken);
      } else {
        end = this.parseUnaryExpr();
      }
    } else {
      const arrayOrStart = this.parseExpr();
      if (!this.check("range_lit")) {
        const body2 = this.parseBlock();
        return this.withLoc({ kind: "for_each", binding: varName, array: arrayOrStart, body: body2 }, forToken);
      }
      start = arrayOrStart;
      if (this.check("range_lit")) {
        const rangeOp = this.advance();
        inclusive = rangeOp.value.includes("=");
        const afterOp = rangeOp.value.replace(/^\.\.=?/, "");
        if (afterOp.length > 0) {
          end = this.withLoc({ kind: "int_lit", value: parseInt(afterOp, 10) }, rangeOp);
        } else {
          end = this.parseExpr();
        }
      } else {
        this.error("Expected .. or ..= in for-range expression");
        start = this.withLoc({ kind: "int_lit", value: 0 }, this.peek());
        end = this.withLoc({ kind: "int_lit", value: 0 }, this.peek());
      }
    }
    const body = this.parseBlock();
    return this.withLoc({ kind: "for_range", varName, start, end, inclusive, body }, forToken);
  }
  parseForeachStmt() {
    const foreachToken = this.expect("foreach");
    this.expect("(");
    const binding = this.expect("ident").value;
    this.expect("in");
    const iterable = this.parseExpr();
    this.expect(")");
    let executeContext;
    const execIdentKeywords = ["positioned", "rotated", "facing", "anchored", "align", "on", "summon"];
    if (this.check("as") || this.check("at") || this.check("in") || this.check("ident") && execIdentKeywords.includes(this.peek().value)) {
      let context = "";
      while (!this.check("{") && !this.check("eof")) {
        context += this.advance().value + " ";
      }
      executeContext = context.trim();
    }
    const body = this.parseBlock();
    return this.withLoc({ kind: "foreach", binding, iterable, body, executeContext }, foreachToken);
  }
  parseMatchPattern() {
    if (this.check("ident") && this.peek().value === "_") {
      this.advance();
      return { kind: "PatWild" };
    }
    if (this.check("ident") && this.peek().value === "None") {
      this.advance();
      return { kind: "PatNone" };
    }
    if (this.check("ident") && this.peek().value === "Some") {
      this.advance();
      this.expect("(");
      const binding = this.expect("ident").value;
      this.expect(")");
      return { kind: "PatSome", binding };
    }
    if (this.check("ident") && this.peek(1).kind === "::") {
      const enumName = this.advance().value;
      this.expect("::");
      const variant = this.expect("ident").value;
      const bindings = [];
      if (this.check("(")) {
        this.advance();
        while (!this.check(")") && !this.check("eof")) {
          bindings.push(this.expect("ident").value);
          if (!this.match(",")) break;
        }
        this.expect(")");
      }
      return { kind: "PatEnum", enumName, variant, bindings };
    }
    if (this.check("int_lit")) {
      const tok = this.advance();
      return { kind: "PatInt", value: parseInt(tok.value, 10) };
    }
    if (this.check("-") && this.peek(1).kind === "int_lit") {
      this.advance();
      const tok = this.advance();
      return { kind: "PatInt", value: -parseInt(tok.value, 10) };
    }
    const e = this.parseExpr();
    return { kind: "PatExpr", expr: e };
  }
  parseMatchStmt() {
    const matchToken = this.expect("match");
    let expr;
    if (this.check("(")) {
      this.advance();
      expr = this.parseExpr();
      this.expect(")");
    } else {
      expr = this.parseExpr();
    }
    this.expect("{");
    const arms = [];
    while (!this.check("}") && !this.check("eof")) {
      const pattern = this.parseMatchPattern();
      this.expect("=>");
      const body = this.parseBlock();
      this.match(",");
      arms.push({ pattern, body });
    }
    this.expect("}");
    return this.withLoc({ kind: "match", expr, arms }, matchToken);
  }
  parseAsStmt() {
    const asToken = this.expect("as");
    const as_sel = this.parseSelector();
    if (this.match("at")) {
      const at_sel = this.parseSelector();
      const body2 = this.parseBlock();
      return this.withLoc({ kind: "as_at", as_sel, at_sel, body: body2 }, asToken);
    }
    const body = this.parseBlock();
    return this.withLoc({ kind: "as_block", selector: as_sel, body }, asToken);
  }
  parseAtStmt() {
    const atToken = this.expect("at");
    const selector = this.parseSelector();
    const body = this.parseBlock();
    return this.withLoc({ kind: "at_block", selector, body }, atToken);
  }
  parseExecuteStmt() {
    const executeToken = this.expect("execute");
    const subcommands = [];
    while (!this.check("run") && !this.check("eof")) {
      if (this.match("as")) {
        const selector = this.parseSelector();
        subcommands.push({ kind: "as", selector });
      } else if (this.match("at")) {
        const selector = this.parseSelector();
        subcommands.push({ kind: "at", selector });
      } else if (this.checkIdent("positioned")) {
        this.advance();
        if (this.match("as")) {
          const selector = this.parseSelector();
          subcommands.push({ kind: "positioned_as", selector });
        } else {
          const x = this.parseCoordToken();
          const y = this.parseCoordToken();
          const z = this.parseCoordToken();
          subcommands.push({ kind: "positioned", x, y, z });
        }
      } else if (this.checkIdent("rotated")) {
        this.advance();
        if (this.match("as")) {
          const selector = this.parseSelector();
          subcommands.push({ kind: "rotated_as", selector });
        } else {
          const yaw = this.parseCoordToken();
          const pitch = this.parseCoordToken();
          subcommands.push({ kind: "rotated", yaw, pitch });
        }
      } else if (this.checkIdent("facing")) {
        this.advance();
        if (this.checkIdent("entity")) {
          this.advance();
          const selector = this.parseSelector();
          const anchor = this.checkIdent("eyes") || this.checkIdent("feet") ? this.advance().value : "feet";
          subcommands.push({ kind: "facing_entity", selector, anchor });
        } else {
          const x = this.parseCoordToken();
          const y = this.parseCoordToken();
          const z = this.parseCoordToken();
          subcommands.push({ kind: "facing", x, y, z });
        }
      } else if (this.checkIdent("anchored")) {
        this.advance();
        const anchor = this.advance().value;
        subcommands.push({ kind: "anchored", anchor });
      } else if (this.checkIdent("align")) {
        this.advance();
        const axes = this.advance().value;
        subcommands.push({ kind: "align", axes });
      } else if (this.checkIdent("on")) {
        this.advance();
        const relation = this.advance().value;
        subcommands.push({ kind: "on", relation });
      } else if (this.checkIdent("summon")) {
        this.advance();
        const entity = this.advance().value;
        subcommands.push({ kind: "summon", entity });
      } else if (this.checkIdent("store")) {
        this.advance();
        const storeType = this.advance().value;
        if (this.checkIdent("score")) {
          this.advance();
          const target = this.advance().value;
          const targetObj = this.advance().value;
          if (storeType === "result") {
            subcommands.push({ kind: "store_result", target, targetObj });
          } else {
            subcommands.push({ kind: "store_success", target, targetObj });
          }
        } else {
          this.error("store currently only supports score target");
        }
      } else if (this.match("if")) {
        this.parseExecuteCondition(subcommands, "if");
      } else if (this.match("unless")) {
        this.parseExecuteCondition(subcommands, "unless");
      } else if (this.match("in")) {
        let dim = this.advance().value;
        if (this.match(":")) {
          dim += ":" + this.advance().value;
        }
        subcommands.push({ kind: "in", dimension: dim });
      } else {
        this.error(`Unexpected token in execute statement: ${this.peek().kind} (${this.peek().value})`);
      }
    }
    this.expect("run");
    const body = this.parseBlock();
    return this.withLoc({ kind: "execute", subcommands, body }, executeToken);
  }
  parseExecuteCondition(subcommands, type) {
    if (this.checkIdent("entity") || this.check("selector")) {
      if (this.checkIdent("entity")) this.advance();
      const selectorOrVar = this.parseSelectorOrVarSelector();
      subcommands.push({ kind: type === "if" ? "if_entity" : "unless_entity", ...selectorOrVar });
    } else if (this.checkIdent("block")) {
      this.advance();
      const x = this.parseCoordToken();
      const y = this.parseCoordToken();
      const z = this.parseCoordToken();
      const block = this.parseBlockId();
      subcommands.push({ kind: type === "if" ? "if_block" : "unless_block", pos: [x, y, z], block });
    } else if (this.checkIdent("score")) {
      this.advance();
      const target = this.advance().value;
      const targetObj = this.advance().value;
      if (this.checkIdent("matches")) {
        this.advance();
        const range = this.advance().value;
        subcommands.push({ kind: type === "if" ? "if_score_range" : "unless_score_range", target, targetObj, range });
      } else {
        const op = this.advance().value;
        const source = this.advance().value;
        const sourceObj = this.advance().value;
        subcommands.push({
          kind: type === "if" ? "if_score" : "unless_score",
          target,
          targetObj,
          op,
          source,
          sourceObj
        });
      }
    } else {
      this.error(`Unknown condition type after ${type}`);
    }
  }
  parseCoordToken() {
    const token = this.peek();
    if (token.kind === "rel_coord" || token.kind === "local_coord" || token.kind === "int_lit" || token.kind === "float_lit" || token.kind === "-" || token.kind === "ident") {
      return this.advance().value;
    }
    this.error(`Expected coordinate, got ${token.kind}`);
    return "~";
  }
  parseBlockId() {
    let id = this.advance().value;
    if (this.match(":")) {
      id += ":" + this.advance().value;
    }
    if (this.check("[")) {
      id += this.advance().value;
      while (!this.check("]") && !this.check("eof")) {
        id += this.advance().value;
      }
      id += this.advance().value;
    }
    return id;
  }
  checkIdent(value) {
    return this.check("ident") && this.peek().value === value;
  }
  parseExprStmt() {
    const expr = this.parseExpr();
    this.match(";");
    const exprToken = this.getLocToken(expr) ?? this.peek();
    return this.withLoc({ kind: "expr", expr }, exprToken);
  }
  // -------------------------------------------------------------------------
  // Expressions (Precedence Climbing)
  // -------------------------------------------------------------------------
  parseExpr() {
    return this.parseAssignment();
  }
  parseAssignment() {
    const left = this.parseBinaryExpr(1);
    const token = this.peek();
    if (token.kind === "=" || token.kind === "+=" || token.kind === "-=" || token.kind === "*=" || token.kind === "/=" || token.kind === "%=") {
      const op = this.advance().kind;
      if (left.kind === "ident") {
        const value = this.parseAssignment();
        return this.withLoc({ kind: "assign", target: left.name, op, value }, this.getLocToken(left) ?? token);
      }
      if (left.kind === "member") {
        const value = this.parseAssignment();
        return this.withLoc(
          { kind: "member_assign", obj: left.obj, field: left.field, op, value },
          this.getLocToken(left) ?? token
        );
      }
      if (left.kind === "index") {
        const value = this.parseAssignment();
        return this.withLoc(
          { kind: "index_assign", obj: left.obj, index: left.index, op, value },
          this.getLocToken(left) ?? token
        );
      }
    }
    return left;
  }
  parseBinaryExpr(minPrec) {
    let left = this.parseUnaryExpr();
    while (true) {
      const op = this.peek().kind;
      if (!BINARY_OPS.has(op)) break;
      const prec = PRECEDENCE[op];
      if (prec < minPrec) break;
      const opToken = this.advance();
      if (op === "is") {
        const entityType = this.parseEntityTypeName();
        left = this.withLoc(
          { kind: "is_check", expr: left, entityType },
          this.getLocToken(left) ?? opToken
        );
        continue;
      }
      const right = this.parseBinaryExpr(prec + 1);
      left = this.withLoc(
        { kind: "binary", op, left, right },
        this.getLocToken(left) ?? opToken
      );
    }
    return left;
  }
  parseUnaryExpr() {
    if (this.match("!")) {
      const bangToken = this.tokens[this.pos - 1];
      const operand = this.parseUnaryExpr();
      return this.withLoc({ kind: "unary", op: "!", operand }, bangToken);
    }
    if (this.check("-") && !this.isSubtraction()) {
      const minusToken = this.advance();
      const operand = this.parseUnaryExpr();
      return this.withLoc({ kind: "unary", op: "-", operand }, minusToken);
    }
    return this.parsePostfixExpr();
  }
  parseEntityTypeName() {
    const token = this.expect("ident");
    if (ENTITY_TYPE_NAMES.has(token.value)) {
      return token.value;
    }
    this.error(`Unknown entity type '${token.value}'`);
  }
  isSubtraction() {
    if (this.pos === 0) return false;
    const prev = this.tokens[this.pos - 1];
    return ["int_lit", "float_lit", "ident", ")", "]"].includes(prev.kind);
  }
  /**
   * Try to parse `<Type, ...>` as explicit generic type arguments.
   * Returns the parsed type list if successful, null if this looks like a comparison.
   * Does NOT consume any tokens if it returns null.
   */
  tryParseTypeArgs() {
    const saved = this.pos;
    this.advance();
    const typeArgs = [];
    try {
      do {
        typeArgs.push(this.parseType());
      } while (this.match(","));
      if (!this.check(">")) {
        this.pos = saved;
        return null;
      }
      this.advance();
      return typeArgs;
    } catch {
      this.pos = saved;
      return null;
    }
  }
  parsePostfixExpr() {
    let expr = this.parsePrimaryExpr();
    while (true) {
      if (expr.kind === "ident" && this.check("<")) {
        const typeArgs = this.tryParseTypeArgs();
        if (typeArgs !== null && this.check("(")) {
          const openParenToken = this.peek();
          this.advance();
          const args = this.parseArgs();
          this.expect(")");
          expr = this.withLoc(
            { kind: "call", fn: expr.name, args, typeArgs },
            this.getLocToken(expr) ?? openParenToken
          );
          continue;
        }
      }
      if (this.match("(")) {
        const openParenToken = this.tokens[this.pos - 1];
        if (expr.kind === "ident") {
          const args2 = this.parseArgs();
          this.expect(")");
          expr = this.withLoc({ kind: "call", fn: expr.name, args: args2 }, this.getLocToken(expr) ?? openParenToken);
          continue;
        }
        if (expr.kind === "member") {
          if (expr.field === "unwrap_or") {
            const defaultExpr = this.parseExpr();
            this.expect(")");
            expr = this.withLoc(
              { kind: "unwrap_or", opt: expr.obj, default_: defaultExpr },
              this.getLocToken(expr) ?? openParenToken
            );
            continue;
          }
          const methodMap = {
            "tag": "__entity_tag",
            "untag": "__entity_untag",
            "has_tag": "__entity_has_tag",
            "push": "__array_push",
            "pop": "__array_pop",
            "add": "set_add",
            "contains": "set_contains",
            "remove": "set_remove",
            "clear": "set_clear"
          };
          const internalFn = methodMap[expr.field];
          if (internalFn) {
            const args3 = this.parseArgs();
            this.expect(")");
            expr = this.withLoc(
              { kind: "call", fn: internalFn, args: [expr.obj, ...args3] },
              this.getLocToken(expr) ?? openParenToken
            );
            continue;
          }
          const args2 = this.parseArgs();
          this.expect(")");
          expr = this.withLoc(
            { kind: "call", fn: expr.field, args: [expr.obj, ...args2] },
            this.getLocToken(expr) ?? openParenToken
          );
          continue;
        }
        const args = this.parseArgs();
        this.expect(")");
        expr = this.withLoc(
          { kind: "invoke", callee: expr, args },
          this.getLocToken(expr) ?? openParenToken
        );
        continue;
      }
      if (this.match("[")) {
        const index = this.parseExpr();
        this.expect("]");
        expr = this.withLoc(
          { kind: "index", obj: expr, index },
          this.getLocToken(expr) ?? this.tokens[this.pos - 1]
        );
        continue;
      }
      if (this.match(".")) {
        const field = this.expect("ident").value;
        expr = this.withLoc(
          { kind: "member", obj: expr, field },
          this.getLocToken(expr) ?? this.tokens[this.pos - 1]
        );
        continue;
      }
      if (this.check("as") && this.isTypeCastAs()) {
        const asToken = this.advance();
        const targetType = this.parseType();
        expr = this.withLoc(
          { kind: "type_cast", expr, targetType },
          this.getLocToken(expr) ?? asToken
        );
        continue;
      }
      break;
    }
    return expr;
  }
  /** Returns true if the current 'as' token is a type cast (not a context block) */
  isTypeCastAs() {
    const next = this.tokens[this.pos + 1];
    if (!next) return false;
    const typeStartTokens = /* @__PURE__ */ new Set(["int", "bool", "float", "fixed", "string", "void", "BlockPos", "("]);
    if (typeStartTokens.has(next.kind)) return true;
    if (next.kind === "ident" && (next.value === "double" || next.value === "byte" || next.value === "short" || next.value === "long" || next.value === "selector" || next.value === "Option")) return true;
    return false;
  }
  parseArgs() {
    const args = [];
    if (!this.check(")")) {
      do {
        args.push(this.parseExpr());
      } while (this.match(","));
    }
    return args;
  }
  parsePrimaryExpr() {
    const token = this.peek();
    if (token.kind === "ident" && this.peek(1).kind === "::") {
      const typeToken = this.advance();
      this.expect("::");
      const memberToken = this.expect("ident");
      if (this.check("(")) {
        const isNamedArgs = this.peek(1).kind === "ident" && this.peek(2).kind === ":";
        if (isNamedArgs) {
          this.advance();
          const args2 = [];
          while (!this.check(")") && !this.check("eof")) {
            const fieldName = this.expect("ident").value;
            this.expect(":");
            const value = this.parseExpr();
            args2.push({ name: fieldName, value });
            if (!this.match(",")) break;
          }
          this.expect(")");
          return this.withLoc({ kind: "enum_construct", enumName: typeToken.value, variant: memberToken.value, args: args2 }, typeToken);
        }
        this.advance();
        const args = this.parseArgs();
        this.expect(")");
        return this.withLoc({ kind: "static_call", type: typeToken.value, method: memberToken.value, args }, typeToken);
      }
      return this.withLoc({ kind: "path_expr", enumName: typeToken.value, variant: memberToken.value }, typeToken);
    }
    if (token.kind === "ident" && this.peek(1).kind === "=>") {
      return this.parseSingleParamLambda();
    }
    if (token.kind === "int_lit") {
      this.advance();
      return this.withLoc({ kind: "int_lit", value: parseInt(token.value, 10) }, token);
    }
    if (token.kind === "float_lit") {
      this.advance();
      return this.withLoc({ kind: "float_lit", value: parseFloat(token.value) }, token);
    }
    if (token.kind === "rel_coord") {
      this.advance();
      return this.withLoc({ kind: "rel_coord", value: token.value }, token);
    }
    if (token.kind === "local_coord") {
      this.advance();
      return this.withLoc({ kind: "local_coord", value: token.value }, token);
    }
    if (token.kind === "byte_lit") {
      this.advance();
      return this.withLoc({ kind: "byte_lit", value: parseInt(token.value.slice(0, -1), 10) }, token);
    }
    if (token.kind === "short_lit") {
      this.advance();
      return this.withLoc({ kind: "short_lit", value: parseInt(token.value.slice(0, -1), 10) }, token);
    }
    if (token.kind === "long_lit") {
      this.advance();
      return this.withLoc({ kind: "long_lit", value: parseInt(token.value.slice(0, -1), 10) }, token);
    }
    if (token.kind === "double_lit") {
      this.advance();
      return this.withLoc({ kind: "double_lit", value: parseFloat(token.value.slice(0, -1)) }, token);
    }
    if (token.kind === "string_lit") {
      this.advance();
      return this.parseStringExpr(token);
    }
    if (token.kind === "f_string") {
      this.advance();
      return this.parseFStringExpr(token);
    }
    if (token.kind === "mc_name") {
      this.advance();
      return this.withLoc({ kind: "mc_name", value: token.value.slice(1) }, token);
    }
    if (token.kind === "true") {
      this.advance();
      return this.withLoc({ kind: "bool_lit", value: true }, token);
    }
    if (token.kind === "false") {
      this.advance();
      return this.withLoc({ kind: "bool_lit", value: false }, token);
    }
    if (token.kind === "range_lit") {
      this.advance();
      return this.withLoc({ kind: "range_lit", range: this.parseRangeValue(token.value) }, token);
    }
    if (token.kind === "selector") {
      this.advance();
      return this.withLoc({
        kind: "selector",
        raw: token.value,
        isSingle: computeIsSingle(token.value),
        sel: this.parseSelectorValue(token.value)
      }, token);
    }
    if (token.kind === "ident" && this.peek(1).kind === "{" && this.peek(2).kind === "ident" && this.peek(3).kind === ":") {
      this.advance();
      return this.parseStructLit();
    }
    if (token.kind === "ident" && token.value === "Some" && this.peek(1).kind === "(") {
      this.advance();
      this.advance();
      const value = this.parseExpr();
      this.expect(")");
      return this.withLoc({ kind: "some_lit", value }, token);
    }
    if (token.kind === "ident" && token.value === "None") {
      this.advance();
      return this.withLoc({ kind: "none_lit" }, token);
    }
    if (token.kind === "ident") {
      this.advance();
      return this.withLoc({ kind: "ident", name: token.value }, token);
    }
    if (token.kind === "(") {
      if (this.isBlockPosLiteral()) {
        return this.parseBlockPos();
      }
      if (this.isLambdaStart()) {
        return this.parseLambdaExpr();
      }
      this.advance();
      const first = this.parseExpr();
      if (this.match(",")) {
        const elements = [first];
        if (!this.check(")")) {
          do {
            elements.push(this.parseExpr());
          } while (this.match(","));
        }
        this.expect(")");
        return this.withLoc({ kind: "tuple_lit", elements }, token);
      }
      this.expect(")");
      return first;
    }
    if (token.kind === "{") {
      return this.parseStructLit();
    }
    if (token.kind === "[") {
      return this.parseArrayLit();
    }
    this.error(`Unexpected token '${token.kind}'`);
  }
  parseLiteralExpr() {
    if (this.check("-")) {
      this.advance();
      const token = this.peek();
      if (token.kind === "int_lit") {
        this.advance();
        return this.withLoc({ kind: "int_lit", value: -Number(token.value) }, token);
      }
      if (token.kind === "float_lit") {
        this.advance();
        return this.withLoc({ kind: "float_lit", value: -Number(token.value) }, token);
      }
      this.error("Expected number after unary -");
    }
    const expr = this.parsePrimaryExpr();
    if (expr.kind === "int_lit" || expr.kind === "float_lit" || expr.kind === "bool_lit" || expr.kind === "str_lit") {
      return expr;
    }
    this.error("Const value must be a literal");
  }
  parseSingleParamLambda() {
    const paramToken = this.expect("ident");
    const params = [{ name: paramToken.value }];
    this.expect("=>");
    return this.finishLambdaExpr(params, paramToken);
  }
  parseLambdaExpr() {
    const openParenToken = this.expect("(");
    const params = [];
    if (!this.check(")")) {
      do {
        const name = this.expect("ident").value;
        let type;
        if (this.match(":")) {
          type = this.parseType();
        }
        params.push({ name, type });
      } while (this.match(","));
    }
    this.expect(")");
    let returnType;
    if (this.match("->")) {
      returnType = this.parseType();
    }
    this.expect("=>");
    return this.finishLambdaExpr(params, openParenToken, returnType);
  }
  finishLambdaExpr(params, token, returnType) {
    const body = this.check("{") ? this.parseBlock() : this.parseExpr();
    return this.withLoc({ kind: "lambda", params, returnType, body }, token);
  }
  parseStringExpr(token) {
    if (!token.value.includes("${")) {
      return this.withLoc({ kind: "str_lit", value: token.value }, token);
    }
    const parts = [];
    let current = "";
    let index = 0;
    while (index < token.value.length) {
      if (token.value[index] === "$" && token.value[index + 1] === "{") {
        if (current) {
          parts.push(current);
          current = "";
        }
        index += 2;
        let depth = 1;
        let exprSource = "";
        let inString = false;
        while (index < token.value.length && depth > 0) {
          const char = token.value[index];
          if (char === '"' && token.value[index - 1] !== "\\") {
            inString = !inString;
          }
          if (!inString) {
            if (char === "{") {
              depth++;
            } else if (char === "}") {
              depth--;
              if (depth === 0) {
                index++;
                break;
              }
            }
          }
          if (depth > 0) {
            exprSource += char;
          }
          index++;
        }
        if (depth !== 0) {
          this.error("Unterminated string interpolation");
        }
        parts.push(this.parseEmbeddedExpr(exprSource));
        continue;
      }
      current += token.value[index];
      index++;
    }
    if (current) {
      parts.push(current);
    }
    return this.withLoc({ kind: "str_interp", parts }, token);
  }
  parseFStringExpr(token) {
    const parts = [];
    let current = "";
    let index = 0;
    while (index < token.value.length) {
      if (token.value[index] === "{") {
        if (current) {
          parts.push({ kind: "text", value: current });
          current = "";
        }
        index++;
        let depth = 1;
        let exprSource = "";
        let inString = false;
        while (index < token.value.length && depth > 0) {
          const char = token.value[index];
          if (char === '"' && token.value[index - 1] !== "\\") {
            inString = !inString;
          }
          if (!inString) {
            if (char === "{") {
              depth++;
            } else if (char === "}") {
              depth--;
              if (depth === 0) {
                index++;
                break;
              }
            }
          }
          if (depth > 0) {
            exprSource += char;
          }
          index++;
        }
        if (depth !== 0) {
          this.error("Unterminated f-string interpolation");
        }
        parts.push({ kind: "expr", expr: this.parseEmbeddedExpr(exprSource) });
        continue;
      }
      current += token.value[index];
      index++;
    }
    if (current) {
      parts.push({ kind: "text", value: current });
    }
    return this.withLoc({ kind: "f_string", parts }, token);
  }
  parseEmbeddedExpr(source) {
    const tokens = new Lexer(source, this.filePath).tokenize();
    const parser = new _Parser(tokens, source, this.filePath);
    const expr = parser.parseExpr();
    if (!parser.check("eof")) {
      parser.error(`Unexpected token '${parser.peek().kind}' in string interpolation`);
    }
    return expr;
  }
  parseStructLit() {
    const braceToken = this.expect("{");
    const fields = [];
    if (!this.check("}")) {
      do {
        const name = this.expect("ident").value;
        this.expect(":");
        const value = this.parseExpr();
        fields.push({ name, value });
      } while (this.match(","));
    }
    this.expect("}");
    return this.withLoc({ kind: "struct_lit", fields }, braceToken);
  }
  parseArrayLit() {
    const bracketToken = this.expect("[");
    const elements = [];
    if (!this.check("]")) {
      do {
        elements.push(this.parseExpr());
      } while (this.match(","));
    }
    this.expect("]");
    return this.withLoc({ kind: "array_lit", elements }, bracketToken);
  }
  isLambdaStart() {
    if (!this.check("(")) return false;
    let offset = 1;
    if (this.peek(offset).kind !== ")") {
      while (true) {
        if (this.peek(offset).kind !== "ident") {
          return false;
        }
        offset += 1;
        if (this.peek(offset).kind === ":") {
          offset += 1;
          const consumed = this.typeTokenLength(offset);
          if (consumed === 0) {
            return false;
          }
          offset += consumed;
        }
        if (this.peek(offset).kind === ",") {
          offset += 1;
          continue;
        }
        break;
      }
    }
    if (this.peek(offset).kind !== ")") {
      return false;
    }
    offset += 1;
    if (this.peek(offset).kind === "=>") {
      return true;
    }
    if (this.peek(offset).kind === "->") {
      offset += 1;
      const consumed = this.typeTokenLength(offset);
      if (consumed === 0) {
        return false;
      }
      offset += consumed;
      return this.peek(offset).kind === "=>";
    }
    return false;
  }
  typeTokenLength(offset) {
    const token = this.peek(offset);
    if (token.kind === "(") {
      let inner = offset + 1;
      if (this.peek(inner).kind !== ")") {
        while (true) {
          const consumed = this.typeTokenLength(inner);
          if (consumed === 0) {
            return 0;
          }
          inner += consumed;
          if (this.peek(inner).kind === ",") {
            inner += 1;
            continue;
          }
          break;
        }
      }
      if (this.peek(inner).kind !== ")") {
        return 0;
      }
      inner += 1;
      if (this.peek(inner).kind !== "->") {
        return 0;
      }
      inner += 1;
      const returnLen = this.typeTokenLength(inner);
      return returnLen === 0 ? 0 : inner + returnLen - offset;
    }
    const isNamedType = token.kind === "int" || token.kind === "bool" || token.kind === "float" || token.kind === "fixed" || token.kind === "string" || token.kind === "void" || token.kind === "BlockPos" || token.kind === "ident";
    if (!isNamedType) {
      return 0;
    }
    let length = 1;
    while (this.peek(offset + length).kind === "[" && this.peek(offset + length + 1).kind === "]") {
      length += 2;
    }
    return length;
  }
  isBlockPosLiteral() {
    if (!this.check("(")) return false;
    let offset = 1;
    for (let i = 0; i < 3; i++) {
      const consumed = this.coordComponentTokenLength(offset);
      if (consumed === 0) return false;
      offset += consumed;
      if (i < 2) {
        if (this.peek(offset).kind !== ",") return false;
        offset += 1;
      }
    }
    return this.peek(offset).kind === ")";
  }
  coordComponentTokenLength(offset) {
    const token = this.peek(offset);
    if (token.kind === "int_lit") {
      return 1;
    }
    if (token.kind === "-") {
      return this.peek(offset + 1).kind === "int_lit" ? 2 : 0;
    }
    if (token.kind === "rel_coord" || token.kind === "local_coord") {
      return 1;
    }
    return 0;
  }
  parseBlockPos() {
    const openParenToken = this.expect("(");
    const x = this.parseCoordComponent();
    this.expect(",");
    const y = this.parseCoordComponent();
    this.expect(",");
    const z = this.parseCoordComponent();
    this.expect(")");
    return this.withLoc({ kind: "blockpos", x, y, z }, openParenToken);
  }
  parseCoordComponent() {
    const token = this.peek();
    if (token.kind === "rel_coord") {
      this.advance();
      const offset = this.parseCoordOffsetFromValue(token.value.slice(1));
      return { kind: "relative", offset };
    }
    if (token.kind === "local_coord") {
      this.advance();
      const offset = this.parseCoordOffsetFromValue(token.value.slice(1));
      return { kind: "local", offset };
    }
    return { kind: "absolute", value: this.parseSignedCoordOffset(true) };
  }
  parseCoordOffsetFromValue(value) {
    if (value === "" || value === void 0) return 0;
    return parseFloat(value);
  }
  parseSignedCoordOffset(requireValue = false) {
    let sign = 1;
    if (this.match("-")) {
      sign = -1;
    }
    if (this.check("int_lit")) {
      return sign * parseInt(this.advance().value, 10);
    }
    if (requireValue) {
      this.error("Expected integer coordinate component");
    }
    return 0;
  }
  // -------------------------------------------------------------------------
  // Selector Parsing
  // -------------------------------------------------------------------------
  parseSelector() {
    const token = this.expect("selector");
    return this.parseSelectorValue(token.value);
  }
  // Parse either a selector (@a[...]) or a variable with filters (p[...])
  // Returns { selector } for selectors or { varName, filters } for variables
  parseSelectorOrVarSelector() {
    if (this.check("selector")) {
      return { selector: this.parseSelector() };
    }
    const varToken = this.expect("ident");
    const varName = varToken.value;
    if (this.check("[")) {
      this.advance();
      let filterStr = "";
      let depth = 1;
      while (depth > 0 && !this.check("eof")) {
        if (this.check("[")) depth++;
        else if (this.check("]")) depth--;
        if (depth > 0) {
          filterStr += this.peek().value ?? this.peek().kind;
          this.advance();
        }
      }
      this.expect("]");
      const filters = this.parseSelectorFilters(filterStr);
      return { varName, filters };
    }
    return { varName };
  }
  parseSelectorValue(value) {
    const bracketIndex = value.indexOf("[");
    if (bracketIndex === -1) {
      return { kind: value };
    }
    const kind = value.slice(0, bracketIndex);
    const paramsStr = value.slice(bracketIndex + 1, -1);
    const filters = this.parseSelectorFilters(paramsStr);
    return { kind, filters };
  }
  parseSelectorFilters(paramsStr) {
    const filters = {};
    const parts = this.splitSelectorParams(paramsStr);
    for (const part of parts) {
      const eqIndex = part.indexOf("=");
      if (eqIndex === -1) continue;
      const key = part.slice(0, eqIndex).trim();
      const val = part.slice(eqIndex + 1).trim();
      switch (key) {
        case "type":
          filters.type = val;
          break;
        case "distance":
          filters.distance = this.parseRangeValue(val);
          break;
        case "tag":
          if (val.startsWith("!")) {
            filters.notTag = filters.notTag ?? [];
            filters.notTag.push(val.slice(1));
          } else {
            filters.tag = filters.tag ?? [];
            filters.tag.push(val);
          }
          break;
        case "limit":
          filters.limit = parseInt(val, 10);
          break;
        case "sort":
          filters.sort = val;
          break;
        case "nbt":
          filters.nbt = val;
          break;
        case "gamemode":
          filters.gamemode = val;
          break;
        case "scores":
          filters.scores = this.parseScoresFilter(val);
          break;
        case "x":
          filters.x = this.parseRangeValue(val);
          break;
        case "y":
          filters.y = this.parseRangeValue(val);
          break;
        case "z":
          filters.z = this.parseRangeValue(val);
          break;
        case "x_rotation":
          filters.x_rotation = this.parseRangeValue(val);
          break;
        case "y_rotation":
          filters.y_rotation = this.parseRangeValue(val);
          break;
      }
    }
    return filters;
  }
  splitSelectorParams(str) {
    const parts = [];
    let current = "";
    let depth = 0;
    for (const char of str) {
      if (char === "{" || char === "[") depth++;
      else if (char === "}" || char === "]") depth--;
      else if (char === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }
    if (current.trim()) {
      parts.push(current.trim());
    }
    return parts;
  }
  parseScoresFilter(val) {
    const scores = {};
    const inner = val.slice(1, -1);
    const parts = inner.split(",");
    for (const part of parts) {
      const [name, range] = part.split("=").map((s) => s.trim());
      scores[name] = this.parseRangeValue(range);
    }
    return scores;
  }
  parseRangeValue(value) {
    if (value.startsWith("..=")) {
      const rest = value.slice(3);
      if (!rest) return {};
      const max = parseInt(rest, 10);
      return { max };
    }
    if (value.startsWith("..")) {
      const rest = value.slice(2);
      if (!rest) return {};
      const max = parseInt(rest, 10);
      return { max };
    }
    const inclIdx = value.indexOf("..=");
    if (inclIdx !== -1) {
      const min = parseInt(value.slice(0, inclIdx), 10);
      const rest = value.slice(inclIdx + 3);
      if (!rest) return { min };
      const max = parseInt(rest, 10);
      return { min, max };
    }
    const dotIndex = value.indexOf("..");
    if (dotIndex !== -1) {
      const min = parseInt(value.slice(0, dotIndex), 10);
      const rest = value.slice(dotIndex + 2);
      if (!rest) return { min };
      const max = parseInt(rest, 10);
      return { min, max };
    }
    const val = parseInt(value, 10);
    return { min: val, max: val };
  }
};

// ../../src/events/types.ts
var EVENT_TYPES = {
  PlayerDeath: {
    tag: "rs.just_died",
    params: ["player: Player"],
    detection: "scoreboard"
  },
  PlayerJoin: {
    tag: "rs.just_joined",
    params: ["player: Player"],
    detection: "tag"
  },
  BlockBreak: {
    tag: "rs.just_broke_block",
    params: ["player: Player"],
    detection: "advancement"
    // Note: block type is NOT available as a runtime parameter — MC has no mechanism
    // to pass event data to function tags. Use minecraft.mined:<block> scoreboard
    // stats for per-block detection, or check the block at player's position in handler.
  },
  EntityKill: {
    tag: "rs.just_killed",
    params: ["player: Player"],
    detection: "scoreboard"
  },
  ItemUse: {
    tag: "rs.just_used_item",
    params: ["player: Player"],
    detection: "scoreboard"
  }
};
function isEventTypeName(value) {
  return value in EVENT_TYPES;
}
function getEventParamSpecs(eventType) {
  return EVENT_TYPES[eventType].params.map(parseEventParam);
}
function parseEventParam(spec) {
  const match = spec.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)$/);
  if (!match) {
    throw new Error(`Invalid event parameter spec: ${spec}`);
  }
  const [, name, typeName] = match;
  return {
    name,
    type: toTypeNode(typeName)
  };
}
function toTypeNode(typeName) {
  if (typeName === "Player") {
    return { kind: "entity", entityType: "Player" };
  }
  if (typeName === "string" || typeName === "int" || typeName === "bool" || typeName === "float" || typeName === "fixed" || typeName === "void" || typeName === "BlockPos" || typeName === "byte" || typeName === "short" || typeName === "long" || typeName === "double") {
    return { kind: "named", name: typeName };
  }
  return { kind: "struct", name: typeName };
}

// ../../src/typechecker/index.ts
var ENTITY_HIERARCHY = {
  "entity": null,
  "Player": "entity",
  "Mob": "entity",
  "HostileMob": "Mob",
  "PassiveMob": "Mob",
  "Zombie": "HostileMob",
  "Skeleton": "HostileMob",
  "Creeper": "HostileMob",
  "Spider": "HostileMob",
  "Enderman": "HostileMob",
  "Blaze": "HostileMob",
  "Witch": "HostileMob",
  "Slime": "HostileMob",
  "ZombieVillager": "HostileMob",
  "Husk": "HostileMob",
  "Drowned": "HostileMob",
  "Stray": "HostileMob",
  "WitherSkeleton": "HostileMob",
  "CaveSpider": "HostileMob",
  "Pig": "PassiveMob",
  "Cow": "PassiveMob",
  "Sheep": "PassiveMob",
  "Chicken": "PassiveMob",
  "Villager": "PassiveMob",
  "WanderingTrader": "PassiveMob",
  "ArmorStand": "entity",
  "Item": "entity",
  "Arrow": "entity"
};
var MC_TYPE_TO_ENTITY = {
  "zombie": "Zombie",
  "minecraft:zombie": "Zombie",
  "skeleton": "Skeleton",
  "minecraft:skeleton": "Skeleton",
  "creeper": "Creeper",
  "minecraft:creeper": "Creeper",
  "spider": "Spider",
  "minecraft:spider": "Spider",
  "enderman": "Enderman",
  "minecraft:enderman": "Enderman",
  "blaze": "Blaze",
  "minecraft:blaze": "Blaze",
  "witch": "Witch",
  "minecraft:witch": "Witch",
  "slime": "Slime",
  "minecraft:slime": "Slime",
  "zombie_villager": "ZombieVillager",
  "minecraft:zombie_villager": "ZombieVillager",
  "husk": "Husk",
  "minecraft:husk": "Husk",
  "drowned": "Drowned",
  "minecraft:drowned": "Drowned",
  "stray": "Stray",
  "minecraft:stray": "Stray",
  "wither_skeleton": "WitherSkeleton",
  "minecraft:wither_skeleton": "WitherSkeleton",
  "cave_spider": "CaveSpider",
  "minecraft:cave_spider": "CaveSpider",
  "pig": "Pig",
  "minecraft:pig": "Pig",
  "cow": "Cow",
  "minecraft:cow": "Cow",
  "sheep": "Sheep",
  "minecraft:sheep": "Sheep",
  "chicken": "Chicken",
  "minecraft:chicken": "Chicken",
  "villager": "Villager",
  "minecraft:villager": "Villager",
  "wandering_trader": "WanderingTrader",
  "minecraft:wandering_trader": "WanderingTrader",
  "armor_stand": "ArmorStand",
  "minecraft:armor_stand": "ArmorStand",
  "item": "Item",
  "minecraft:item": "Item",
  "arrow": "Arrow",
  "minecraft:arrow": "Arrow"
};
var VOID_TYPE = { kind: "named", name: "void" };
var INT_TYPE = { kind: "named", name: "int" };
var STRING_TYPE = { kind: "named", name: "string" };
var FORMAT_STRING_TYPE = { kind: "named", name: "format_string" };
var BUILTIN_SIGNATURES = {
  setTimeout: {
    params: [INT_TYPE, { kind: "function_type", params: [], return: VOID_TYPE }],
    return: VOID_TYPE
  },
  setInterval: {
    params: [INT_TYPE, { kind: "function_type", params: [], return: VOID_TYPE }],
    return: INT_TYPE
  },
  clearInterval: {
    params: [INT_TYPE],
    return: VOID_TYPE
  }
};
var TypeChecker = class _TypeChecker {
  constructor(source, filePath) {
    this.lintWarnings = [];
    this.functions = /* @__PURE__ */ new Map();
    this.implMethods = /* @__PURE__ */ new Map();
    this.structs = /* @__PURE__ */ new Map();
    this.enums = /* @__PURE__ */ new Map();
    // enumName → variantName → field list (for payload variants)
    this.enumPayloads = /* @__PURE__ */ new Map();
    this.consts = /* @__PURE__ */ new Map();
    this.globals = /* @__PURE__ */ new Map();
    this.currentFn = null;
    this.currentReturnType = null;
    this.scope = /* @__PURE__ */ new Map();
    // Stack for tracking @s type in different contexts
    this.selfTypeStack = ["entity"];
    // Depth of loop/conditional nesting (for static-allocation enforcement)
    this.loopDepth = 0;
    this.condDepth = 0;
    this.richTextBuiltins = /* @__PURE__ */ new Map([
      ["say", { messageIndex: 0 }],
      ["announce", { messageIndex: 0 }],
      ["tell", { messageIndex: 1 }],
      ["tellraw", { messageIndex: 1 }],
      ["title", { messageIndex: 1 }],
      ["actionbar", { messageIndex: 1 }],
      ["subtitle", { messageIndex: 1 }]
    ]);
    this.collector = new DiagnosticCollector(source, filePath);
    this.filePath = filePath;
  }
  getNodeLocation(node) {
    const span = node?.span;
    return {
      line: span?.line ?? 1,
      col: span?.col ?? 1
    };
  }
  report(message, node) {
    const { line, col } = this.getNodeLocation(node);
    this.collector.error("TypeError", message, line, col);
  }
  warnLint(message, node) {
    const { line, col } = this.getNodeLocation(node);
    const filePart = this.filePath ? `${this.filePath}:` : "";
    this.lintWarnings.push(
      `${filePart}line ${line}, col ${col}: ${message}`
    );
  }
  /** Returns lint warnings (non-blocking). */
  getWarnings() {
    return this.lintWarnings;
  }
  /**
   * Type check a program. Returns collected errors.
   */
  check(program) {
    for (const fn of program.declarations) {
      this.functions.set(fn.name, fn);
    }
    for (const global of program.globals ?? []) {
      this.globals.set(global.name, this.normalizeType(global.type));
    }
    for (const implBlock of program.implBlocks ?? []) {
      let methods = this.implMethods.get(implBlock.typeName);
      if (!methods) {
        methods = /* @__PURE__ */ new Map();
        this.implMethods.set(implBlock.typeName, methods);
      }
      for (const method of implBlock.methods) {
        const selfIndex = method.params.findIndex((param) => param.name === "self");
        if (selfIndex > 0) {
          this.report(`Method '${method.name}' must declare 'self' as the first parameter`, method.params[selfIndex]);
        }
        if (selfIndex === 0) {
          const selfType = this.normalizeType(method.params[0].type);
          if (selfType.kind !== "struct" || selfType.name !== implBlock.typeName) {
            this.report(`Method '${method.name}' has invalid 'self' type`, method.params[0]);
          }
        }
        methods.set(method.name, method);
      }
    }
    for (const struct of program.structs ?? []) {
      const fields = /* @__PURE__ */ new Map();
      for (const field of struct.fields) {
        fields.set(field.name, field.type);
      }
      this.structs.set(struct.name, fields);
    }
    for (const enumDecl of program.enums ?? []) {
      const variants = /* @__PURE__ */ new Map();
      const payloads = /* @__PURE__ */ new Map();
      for (const variant of enumDecl.variants) {
        variants.set(variant.name, variant.value ?? 0);
        if (variant.fields && variant.fields.length > 0) {
          payloads.set(variant.name, variant.fields);
        }
      }
      this.enums.set(enumDecl.name, variants);
      if (payloads.size > 0) {
        this.enumPayloads.set(enumDecl.name, payloads);
      }
    }
    for (const constDecl of program.consts ?? []) {
      const constType = this.normalizeType(constDecl.type);
      const actualType = this.inferType(constDecl.value);
      if (!this.typesMatch(constType, actualType)) {
        this.report(
          `Type mismatch: expected ${this.typeToString(constType)}, got ${this.typeToString(actualType)}`,
          constDecl.value
        );
      }
      this.consts.set(constDecl.name, constType);
    }
    for (const fn of program.declarations) {
      this.checkFunction(fn);
    }
    for (const implBlock of program.implBlocks ?? []) {
      for (const method of implBlock.methods) {
        this.checkFunction(method);
      }
    }
    return this.collector.getErrors();
  }
  checkFunction(fn) {
    if (fn.typeParams && fn.typeParams.length > 0) return;
    this.currentFn = fn;
    this.currentReturnType = this.normalizeType(fn.returnType);
    this.scope = /* @__PURE__ */ new Map();
    let seenDefault = false;
    this.checkFunctionDecorators(fn);
    for (const [name, type] of this.consts.entries()) {
      this.scope.set(name, { type, mutable: false });
    }
    for (const [name, type] of this.globals.entries()) {
      this.scope.set(name, { type, mutable: true });
    }
    for (const param of fn.params) {
      this.scope.set(param.name, { type: this.normalizeType(param.type), mutable: true });
      if (param.default) {
        seenDefault = true;
        this.checkExpr(param.default);
        const defaultType = this.inferType(param.default);
        const paramType = this.normalizeType(param.type);
        if (!this.typesMatch(paramType, defaultType)) {
          this.report(
            `Default value for '${param.name}' must be ${this.typeToString(paramType)}, got ${this.typeToString(defaultType)}`,
            param.default
          );
        }
      } else if (seenDefault) {
        this.report(`Parameter '${param.name}' cannot follow a default parameter`, param);
      }
    }
    this.checkBlock(fn.body);
    this.currentFn = null;
    this.currentReturnType = null;
  }
  checkFunctionDecorators(fn) {
    const eventDecorators = fn.decorators.filter((decorator) => decorator.name === "on");
    if (eventDecorators.length === 0) {
      return;
    }
    if (eventDecorators.length > 1) {
      this.report(`Function '${fn.name}' cannot have multiple @on decorators`, fn);
      return;
    }
    const eventType = eventDecorators[0].args?.eventType;
    if (!eventType) {
      this.report(`Function '${fn.name}' is missing an event type in @on(...)`, fn);
      return;
    }
    if (!isEventTypeName(eventType)) {
      this.report(`Unknown event type '${eventType}'`, fn);
      return;
    }
    const expectedParams = getEventParamSpecs(eventType);
    if (fn.params.length !== expectedParams.length) {
      this.report(
        `Event handler '${fn.name}' for ${eventType} must declare ${expectedParams.length} parameter(s), got ${fn.params.length}`,
        fn
      );
      return;
    }
    for (let i = 0; i < expectedParams.length; i++) {
      const actual = this.normalizeType(fn.params[i].type);
      const expected = this.normalizeType(expectedParams[i].type);
      if (!this.typesMatch(expected, actual)) {
        this.report(
          `Event handler '${fn.name}' parameter ${i + 1} must be ${this.typeToString(expected)}, got ${this.typeToString(actual)}`,
          fn.params[i]
        );
      }
    }
  }
  checkBlock(stmts) {
    for (const stmt of stmts) {
      this.checkStmt(stmt);
    }
  }
  checkStmt(stmt) {
    switch (stmt.kind) {
      case "let":
        this.checkLetStmt(stmt);
        break;
      case "let_destruct":
        this.checkLetDestructStmt(stmt);
        break;
      case "return":
        this.checkReturnStmt(stmt);
        break;
      case "if":
        this.checkExpr(stmt.cond);
        this.condDepth++;
        this.checkIfBranches(stmt);
        this.condDepth--;
        break;
      case "while":
        this.checkExpr(stmt.cond);
        this.loopDepth++;
        this.checkBlock(stmt.body);
        this.loopDepth--;
        break;
      case "for":
        if (stmt.init) this.checkStmt(stmt.init);
        this.checkExpr(stmt.cond);
        this.checkExpr(stmt.step);
        this.loopDepth++;
        this.checkBlock(stmt.body);
        this.loopDepth--;
        break;
      case "foreach":
        this.checkExpr(stmt.iterable);
        if (stmt.iterable.kind === "selector") {
          const entityType = this.inferEntityTypeFromSelector(stmt.iterable.sel);
          this.scope.set(stmt.binding, {
            type: { kind: "entity", entityType },
            mutable: false
            // Entity bindings are not reassignable
          });
          this.pushSelfType(entityType);
          this.loopDepth++;
          this.checkBlock(stmt.body);
          this.loopDepth--;
          this.popSelfType();
        } else {
          const iterableType = this.inferType(stmt.iterable);
          if (iterableType.kind === "array") {
            this.scope.set(stmt.binding, { type: iterableType.elem, mutable: true });
          } else {
            this.scope.set(stmt.binding, { type: { kind: "named", name: "void" }, mutable: true });
          }
          this.loopDepth++;
          this.checkBlock(stmt.body);
          this.loopDepth--;
        }
        break;
      case "match":
        this.checkExpr(stmt.expr);
        for (const arm of stmt.arms) {
          if (arm.pattern.kind === "PatExpr") {
            this.checkExpr(arm.pattern.expr);
            const subjectType = this.inferType(stmt.expr);
            const patternType = this.inferType(arm.pattern.expr);
            const isUnknown = (t) => t.kind === "named" && t.name === "void";
            if (!isUnknown(subjectType) && !isUnknown(patternType) && !this.typesMatch(subjectType, patternType)) {
              this.report("Match arm pattern type must match subject type", arm.pattern.expr);
            }
            this.checkBlock(arm.body);
          } else if (arm.pattern.kind === "PatEnum") {
            const pat = arm.pattern;
            const variantPayloads = this.enumPayloads.get(pat.enumName)?.get(pat.variant) ?? [];
            const savedScope = new Map(this.scope);
            for (let i = 0; i < pat.bindings.length; i++) {
              const fieldDef = variantPayloads[i];
              const bindingType = fieldDef ? fieldDef.type : { kind: "named", name: "int" };
              this.scope.set(pat.bindings[i], { type: bindingType, mutable: false });
            }
            this.checkBlock(arm.body);
            this.scope = savedScope;
          } else {
            this.checkBlock(arm.body);
          }
        }
        break;
      case "as_block": {
        const entityType = this.inferEntityTypeFromSelector(stmt.selector);
        this.pushSelfType(entityType);
        this.checkBlock(stmt.body);
        this.popSelfType();
        break;
      }
      case "at_block":
        this.checkBlock(stmt.body);
        break;
      case "as_at": {
        const entityType = this.inferEntityTypeFromSelector(stmt.as_sel);
        this.pushSelfType(entityType);
        this.checkBlock(stmt.body);
        this.popSelfType();
        break;
      }
      case "execute":
        for (const sub of stmt.subcommands) {
          if (sub.kind === "as" && sub.selector) {
            const entityType = this.inferEntityTypeFromSelector(sub.selector);
            this.pushSelfType(entityType);
          }
        }
        this.checkBlock(stmt.body);
        for (const sub of stmt.subcommands) {
          if (sub.kind === "as") {
            this.popSelfType();
          }
        }
        break;
      case "expr":
        this.checkExpr(stmt.expr);
        break;
      case "raw":
        break;
    }
  }
  checkLetDestructStmt(stmt) {
    this.checkExpr(stmt.init);
    const initType = this.inferType(stmt.init);
    if (stmt.type) {
      const normalized = this.normalizeType(stmt.type);
      if (normalized.kind !== "tuple") {
        this.report(`Destructuring type annotation must be a tuple type`, stmt);
        return;
      }
      if (normalized.elements.length !== stmt.names.length) {
        this.report(
          `Destructuring pattern has ${stmt.names.length} bindings but type has ${normalized.elements.length} elements`,
          stmt
        );
      }
      for (let i = 0; i < stmt.names.length; i++) {
        const elemType = normalized.elements[i] ?? { kind: "named", name: "int" };
        this.scope.set(stmt.names[i], { type: elemType, mutable: true });
      }
    } else if (initType.kind === "tuple") {
      if (initType.elements.length !== stmt.names.length) {
        this.report(
          `Destructuring pattern has ${stmt.names.length} bindings but tuple has ${initType.elements.length} elements`,
          stmt
        );
      }
      for (let i = 0; i < stmt.names.length; i++) {
        const elemType = initType.elements[i] ?? { kind: "named", name: "int" };
        this.scope.set(stmt.names[i], { type: elemType, mutable: true });
      }
    } else {
      for (const name of stmt.names) {
        this.scope.set(name, { type: INT_TYPE, mutable: true });
      }
    }
  }
  checkLetStmt(stmt) {
    const expectedType = stmt.type ? this.normalizeType(stmt.type) : void 0;
    this.checkExpr(stmt.init, expectedType);
    const type = expectedType ?? this.inferType(stmt.init);
    this.scope.set(stmt.name, { type, mutable: true });
    const actualType = this.inferType(stmt.init, expectedType);
    if (expectedType && stmt.init.kind !== "struct_lit" && stmt.init.kind !== "array_lit" && !(actualType.kind === "named" && actualType.name === "void")) {
      if (this.isNumericMismatch(expectedType, actualType)) {
        this.report(
          `Type mismatch: cannot implicitly convert ${this.typeToString(actualType)} to ${this.typeToString(expectedType)} (use an explicit cast: 'as ${this.typeToString(expectedType)}')`,
          stmt
        );
      } else if (!this.typesMatch(expectedType, actualType)) {
        this.report(
          `Type mismatch: expected ${this.typeToString(expectedType)}, got ${this.typeToString(actualType)}`,
          stmt
        );
      }
    }
  }
  checkReturnStmt(stmt) {
    if (!this.currentReturnType) return;
    const expectedType = this.currentReturnType;
    if (stmt.value) {
      const actualType = this.inferType(stmt.value, expectedType);
      this.checkExpr(stmt.value, expectedType);
      const returnIsFloat = expectedType.kind === "named" && expectedType.name === "float";
      if (returnIsFloat && stmt.value.kind === "binary") {
        const arithmeticOps = ["+", "-", "*", "/", "%"];
        if (arithmeticOps.includes(stmt.value.op)) {
          this.warnLint(
            `[FloatArithmetic] 'float' is a system boundary type (MC NBT float); use 'fixed' for arithmetic instead.`,
            stmt.value
          );
        }
      }
      if (this.isNumericMismatch(expectedType, actualType)) {
        this.report(
          `Return type mismatch: cannot implicitly convert ${this.typeToString(actualType)} to ${this.typeToString(expectedType)} (use an explicit cast: 'as ${this.typeToString(expectedType)}')`,
          stmt
        );
      } else if (!this.typesMatch(expectedType, actualType)) {
        this.report(
          `Return type mismatch: expected ${this.typeToString(expectedType)}, got ${this.typeToString(actualType)}`,
          stmt
        );
      }
    } else {
      if (expectedType.kind !== "named" || expectedType.name !== "void") {
        this.report(`Missing return value: expected ${this.typeToString(expectedType)}`, stmt);
      }
    }
  }
  checkExpr(expr, expectedType) {
    switch (expr.kind) {
      case "ident":
        if (!this.scope.has(expr.name)) {
          this.report(`Variable '${expr.name}' used before declaration`, expr);
        }
        break;
      case "call":
        this.checkCallExpr(expr);
        break;
      case "invoke":
        this.checkInvokeExpr(expr);
        break;
      case "member":
        this.checkMemberExpr(expr);
        break;
      case "static_call":
        this.checkStaticCallExpr(expr);
        break;
      case "binary": {
        this.checkExpr(expr.left);
        this.checkExpr(expr.right);
        const arithmeticOps = ["+", "-", "*", "/", "%"];
        if (arithmeticOps.includes(expr.op)) {
          const leftType = this.inferType(expr.left);
          const rightType = this.inferType(expr.right);
          const leftIsString = leftType.kind === "named" && (leftType.name === "string" || leftType.name === "format_string");
          const rightIsString = rightType.kind === "named" && (rightType.name === "string" || rightType.name === "format_string");
          if (leftIsString || rightIsString) {
            this.report(
              `[StringConcat] String concatenation with '+' is not supported. Use f-strings instead: f"text{variable}" \u2014 e.g. f"Score: {score}"`,
              expr
            );
          }
          const leftIsFloat = leftType.kind === "named" && leftType.name === "float";
          const rightIsFloat = rightType.kind === "named" && rightType.name === "float";
          if (leftIsFloat || rightIsFloat) {
            this.warnLint(
              `[FloatArithmetic] 'float' is a system boundary type (MC NBT); use 'fixed' for arithmetic. Float arithmetic results are undefined.`,
              expr
            );
          }
        }
        break;
      }
      case "is_check": {
        this.checkExpr(expr.expr);
        const checkedType = this.inferType(expr.expr);
        if (checkedType.kind !== "entity") {
          this.report(`'is' checks require an entity expression, got ${this.typeToString(checkedType)}`, expr.expr);
        }
        break;
      }
      case "unary":
        this.checkExpr(expr.operand);
        break;
      case "assign":
        if (!this.scope.has(expr.target)) {
          this.report(`Variable '${expr.target}' used before declaration`, expr);
        } else if (!this.scope.get(expr.target)?.mutable) {
          this.report(`Cannot assign to const '${expr.target}'`, expr);
        }
        this.checkExpr(expr.value, this.scope.get(expr.target)?.type);
        break;
      case "member_assign":
        this.checkExpr(expr.obj);
        this.checkExpr(expr.value);
        break;
      case "index_assign":
        this.checkExpr(expr.obj);
        this.checkExpr(expr.index);
        this.checkExpr(expr.value);
        break;
      case "index":
        this.checkExpr(expr.obj);
        this.checkExpr(expr.index);
        const indexType = this.inferType(expr.index);
        if (indexType.kind !== "named" || indexType.name !== "int") {
          this.report("Array index must be int", expr.index);
        }
        break;
      case "struct_lit":
        for (const field of expr.fields) {
          this.checkExpr(field.value);
        }
        break;
      case "str_interp":
        for (const part of expr.parts) {
          if (typeof part !== "string") {
            this.checkExpr(part);
          }
        }
        break;
      case "f_string":
        for (const part of expr.parts) {
          if (part.kind !== "expr") {
            continue;
          }
          this.checkExpr(part.expr);
          const partType = this.inferType(part.expr);
          const isUnknown = partType.kind === "named" && partType.name === "void";
          if (!isUnknown && !(partType.kind === "named" && ["int", "string", "format_string", "fixed", "double", "bool", "byte", "short", "long"].includes(partType.name))) {
            this.report(
              `f-string placeholder must be int or string, got ${this.typeToString(partType)}`,
              part.expr
            );
          }
        }
        break;
      case "array_lit":
        for (const elem of expr.elements) {
          this.checkExpr(elem);
        }
        break;
      case "tuple_lit":
        if (expr.elements.length < 2 || expr.elements.length > 8) {
          this.report(`Tuple must have 2-8 elements, got ${expr.elements.length}`, expr);
        }
        for (const elem of expr.elements) {
          this.checkExpr(elem);
        }
        break;
      case "lambda":
        this.checkLambdaExpr(expr, expectedType);
        break;
      case "path_expr":
        if (!this.enums.has(expr.enumName)) {
          this.report(`Unknown enum '${expr.enumName}'`, expr);
        } else {
          const variants = this.enums.get(expr.enumName);
          if (!variants.has(expr.variant)) {
            this.report(`Enum '${expr.enumName}' has no variant '${expr.variant}'`, expr);
          }
        }
        break;
      case "enum_construct": {
        if (!this.enums.has(expr.enumName)) {
          this.report(`Unknown enum '${expr.enumName}'`, expr);
          break;
        }
        const variants = this.enums.get(expr.enumName);
        if (!variants.has(expr.variant)) {
          this.report(`Enum '${expr.enumName}' has no variant '${expr.variant}'`, expr);
          break;
        }
        const variantPayloads = this.enumPayloads.get(expr.enumName)?.get(expr.variant) ?? [];
        if (variantPayloads.length === 0 && expr.args.length > 0) {
          this.report(`Enum variant '${expr.enumName}::${expr.variant}' has no payload fields`, expr);
          break;
        }
        for (const arg of expr.args) {
          const fieldDef = variantPayloads.find((f) => f.name === arg.name);
          if (!fieldDef) {
            this.report(`Unknown field '${arg.name}' for enum variant '${expr.enumName}::${expr.variant}'`, expr);
          } else {
            this.checkExpr(arg.value, fieldDef.type);
          }
        }
        break;
      }
      case "blockpos":
        break;
      // Literals don't need checking
      case "int_lit":
      case "float_lit":
      case "bool_lit":
      case "str_lit":
      case "mc_name":
      case "range_lit":
      case "selector":
      case "byte_lit":
      case "short_lit":
      case "long_lit":
      case "double_lit":
        break;
      case "type_cast":
        this.checkExpr(expr.expr);
        break;
    }
  }
  checkCallExpr(expr) {
    if (expr.fn === "tp" || expr.fn === "tp_to") {
      this.checkTpCall(expr);
    }
    const richTextBuiltin = this.richTextBuiltins.get(expr.fn);
    if (richTextBuiltin) {
      this.checkRichTextBuiltinCall(expr, richTextBuiltin.messageIndex);
      return;
    }
    const builtin = BUILTIN_SIGNATURES[expr.fn];
    if (builtin) {
      if (expr.fn === "setTimeout" || expr.fn === "setInterval") {
        if (this.loopDepth > 0) {
          this.report(
            `${expr.fn}() cannot be called inside a loop. Declare timers at the top level.`,
            expr
          );
        } else if (this.condDepth > 0) {
          this.report(
            `${expr.fn}() cannot be called inside an if/else body. Declare timers at the top level.`,
            expr
          );
        }
      }
      this.checkFunctionCallArgs(expr.args, builtin.params, expr.fn, expr);
      return;
    }
    const fn = this.functions.get(expr.fn);
    if (fn) {
      if (fn.typeParams && fn.typeParams.length > 0) {
        const requiredParams2 = fn.params.filter((param) => !param.default).length;
        if (expr.args.length < requiredParams2 || expr.args.length > fn.params.length) {
          this.report(
            `Function '${expr.fn}' expects ${requiredParams2}-${fn.params.length} arguments, got ${expr.args.length}`,
            expr
          );
        }
        for (const arg of expr.args) this.checkExpr(arg);
        return;
      }
      const requiredParams = fn.params.filter((param) => !param.default).length;
      if (expr.args.length < requiredParams || expr.args.length > fn.params.length) {
        const expectedRange = requiredParams === fn.params.length ? `${fn.params.length}` : `${requiredParams}-${fn.params.length}`;
        this.report(
          `Function '${expr.fn}' expects ${expectedRange} arguments, got ${expr.args.length}`,
          expr
        );
      }
      for (let i = 0; i < expr.args.length; i++) {
        const paramType = fn.params[i] ? this.normalizeType(fn.params[i].type) : void 0;
        if (paramType) {
          this.checkExpr(expr.args[i], paramType);
        }
        const argType = this.inferType(expr.args[i], paramType);
        if (paramType && !this.typesMatch(paramType, argType)) {
          this.report(
            `Argument ${i + 1} of '${expr.fn}' expects ${this.typeToString(paramType)}, got ${this.typeToString(argType)}`,
            expr.args[i]
          );
        }
      }
      return;
    }
    const varType = this.scope.get(expr.fn)?.type;
    if (varType?.kind === "function_type") {
      this.checkFunctionCallArgs(expr.args, varType.params, expr.fn, expr);
      return;
    }
    const implMethod = this.resolveInstanceMethod(expr);
    if (implMethod) {
      this.checkFunctionCallArgs(
        expr.args,
        implMethod.params.map((param) => this.normalizeType(param.type)),
        implMethod.name,
        expr
      );
      return;
    }
    for (const arg of expr.args) {
      this.checkExpr(arg);
    }
  }
  checkRichTextBuiltinCall(expr, messageIndex) {
    for (let i = 0; i < expr.args.length; i++) {
      this.checkExpr(expr.args[i], i === messageIndex ? void 0 : STRING_TYPE);
    }
    const message = expr.args[messageIndex];
    if (!message) {
      return;
    }
    const messageType = this.inferType(message);
    if (messageType.kind !== "named" || messageType.name !== "string" && messageType.name !== "format_string") {
      this.report(
        `Argument ${messageIndex + 1} of '${expr.fn}' expects string or format_string, got ${this.typeToString(messageType)}`,
        message
      );
    }
  }
  checkInvokeExpr(expr) {
    this.checkExpr(expr.callee);
    const calleeType = this.inferType(expr.callee);
    if (calleeType.kind !== "function_type") {
      this.report("Attempted to call a non-function value", expr.callee);
      for (const arg of expr.args) {
        this.checkExpr(arg);
      }
      return;
    }
    this.checkFunctionCallArgs(expr.args, calleeType.params, "lambda", expr);
  }
  checkFunctionCallArgs(args, params, calleeName, node) {
    if (args.length !== params.length) {
      this.report(`Function '${calleeName}' expects ${params.length} arguments, got ${args.length}`, node);
    }
    for (let i = 0; i < args.length; i++) {
      const paramType = params[i];
      if (!paramType) {
        this.checkExpr(args[i]);
        continue;
      }
      this.checkExpr(args[i], paramType);
      const argType = this.inferType(args[i], paramType);
      if (!this.typesMatch(paramType, argType)) {
        this.report(
          `Argument ${i + 1} of '${calleeName}' expects ${this.typeToString(paramType)}, got ${this.typeToString(argType)}`,
          args[i]
        );
      }
    }
  }
  checkTpCall(expr) {
    const dest = expr.args[1];
    if (!dest) {
      return;
    }
    const destType = this.inferType(dest);
    if (destType.kind === "named" && destType.name === "BlockPos") {
      return;
    }
    if (dest.kind === "selector" && !dest.isSingle) {
      this.report(
        "tp destination must be a single-entity selector (@s, @p, @r, or limit=1)",
        dest
      );
    }
  }
  checkMemberExpr(expr) {
    if (!(expr.obj.kind === "ident" && this.enums.has(expr.obj.name))) {
      this.checkExpr(expr.obj);
    }
    if (expr.obj.kind === "ident") {
      if (this.enums.has(expr.obj.name)) {
        const enumVariants = this.enums.get(expr.obj.name);
        if (!enumVariants.has(expr.field)) {
          this.report(`Enum '${expr.obj.name}' has no variant '${expr.field}'`, expr);
        }
        return;
      }
      const varSymbol = this.scope.get(expr.obj.name);
      const varType = varSymbol?.type;
      if (varType) {
        if (varType.kind === "struct") {
          const structFields = this.structs.get(varType.name);
          if (structFields && !structFields.has(expr.field)) {
            this.report(`Struct '${varType.name}' has no field '${expr.field}'`, expr);
          }
        } else if (varType.kind === "array") {
          if (expr.field !== "len" && expr.field !== "push" && expr.field !== "pop") {
            this.report(`Array has no field '${expr.field}'`, expr);
          }
        } else if (varType.kind === "named") {
          if (varType.name !== "void") {
            if (["int", "bool", "float", "fixed", "string", "byte", "short", "long", "double"].includes(varType.name)) {
              this.report(
                `Cannot access member '${expr.field}' on ${this.typeToString(varType)}`,
                expr
              );
            }
          }
        }
      }
    }
  }
  checkStaticCallExpr(expr) {
    if (expr.type === "Timer" && expr.method === "new") {
      if (this.loopDepth > 0) {
        this.report(
          `Timer::new() cannot be called inside a loop. Declare timers at the top level.`,
          expr
        );
      } else if (this.condDepth > 0) {
        this.report(
          `Timer::new() cannot be called inside an if/else body. Declare timers at the top level.`,
          expr
        );
      }
    }
    const method = this.implMethods.get(expr.type)?.get(expr.method);
    if (!method) {
      this.report(`Type '${expr.type}' has no static method '${expr.method}'`, expr);
      for (const arg of expr.args) {
        this.checkExpr(arg);
      }
      return;
    }
    if (method.params[0]?.name === "self") {
      this.report(`Method '${expr.type}::${expr.method}' is an instance method`, expr);
      return;
    }
    this.checkFunctionCallArgs(
      expr.args,
      method.params.map((param) => this.normalizeType(param.type)),
      `${expr.type}::${expr.method}`,
      expr
    );
  }
  checkLambdaExpr(expr, expectedType) {
    const normalizedExpected = expectedType ? this.normalizeType(expectedType) : void 0;
    const expectedFnType = normalizedExpected?.kind === "function_type" ? normalizedExpected : void 0;
    const lambdaType = this.inferLambdaType(expr, expectedFnType);
    if (expectedFnType && !this.typesMatch(expectedFnType, lambdaType)) {
      this.report(
        `Type mismatch: expected ${this.typeToString(expectedFnType)}, got ${this.typeToString(lambdaType)}`,
        expr
      );
      return;
    }
    const outerScope = this.scope;
    const outerReturnType = this.currentReturnType;
    const lambdaScope = new Map(this.scope);
    const paramTypes = expectedFnType?.params ?? lambdaType.params;
    for (let i = 0; i < expr.params.length; i++) {
      lambdaScope.set(expr.params[i].name, {
        type: paramTypes[i] ?? { kind: "named", name: "void" },
        mutable: true
      });
    }
    this.scope = lambdaScope;
    this.currentReturnType = expr.returnType ? this.normalizeType(expr.returnType) : expectedFnType?.return ?? lambdaType.return;
    if (Array.isArray(expr.body)) {
      this.checkBlock(expr.body);
    } else {
      this.checkExpr(expr.body, this.currentReturnType);
      const actualType = this.inferType(expr.body, this.currentReturnType);
      if (!this.typesMatch(this.currentReturnType, actualType)) {
        this.report(
          `Return type mismatch: expected ${this.typeToString(this.currentReturnType)}, got ${this.typeToString(actualType)}`,
          expr.body
        );
      }
    }
    this.scope = outerScope;
    this.currentReturnType = outerReturnType;
  }
  checkIfBranches(stmt) {
    const narrowed = this.getThenBranchNarrowing(stmt.cond);
    if (narrowed) {
      const thenScope = new Map(this.scope);
      thenScope.set(narrowed.name, { type: narrowed.type, mutable: narrowed.mutable });
      const outerScope = this.scope;
      this.scope = thenScope;
      this.checkBlock(stmt.then);
      this.scope = outerScope;
    } else {
      this.checkBlock(stmt.then);
    }
    if (stmt.else_) {
      this.checkBlock(stmt.else_);
    }
  }
  getThenBranchNarrowing(cond) {
    if (cond.kind !== "is_check" || cond.expr.kind !== "ident") {
      return null;
    }
    const symbol = this.scope.get(cond.expr.name);
    if (!symbol || symbol.type.kind !== "entity") {
      return null;
    }
    return {
      name: cond.expr.name,
      type: { kind: "entity", entityType: cond.entityType },
      mutable: symbol.mutable
    };
  }
  inferType(expr, expectedType) {
    switch (expr.kind) {
      case "int_lit":
        return { kind: "named", name: "int" };
      case "float_lit":
        return { kind: "named", name: "fixed" };
      case "byte_lit":
        return { kind: "named", name: "byte" };
      case "short_lit":
        return { kind: "named", name: "short" };
      case "long_lit":
        return { kind: "named", name: "long" };
      case "double_lit":
        return { kind: "named", name: "double" };
      case "bool_lit":
        return { kind: "named", name: "bool" };
      case "str_lit":
      case "mc_name":
        return { kind: "named", name: "string" };
      case "str_interp":
        for (const part of expr.parts) {
          if (typeof part !== "string") {
            this.checkExpr(part);
          }
        }
        return { kind: "named", name: "string" };
      case "f_string":
        for (const part of expr.parts) {
          if (part.kind === "expr") {
            this.checkExpr(part.expr);
          }
        }
        return FORMAT_STRING_TYPE;
      case "blockpos":
        return { kind: "named", name: "BlockPos" };
      case "ident":
        return this.scope.get(expr.name)?.type ?? { kind: "named", name: "void" };
      case "call": {
        const builtin = BUILTIN_SIGNATURES[expr.fn];
        if (builtin) {
          return builtin.return;
        }
        if (expr.fn === "__array_push") {
          return VOID_TYPE;
        }
        if (expr.fn === "__array_pop") {
          const target = expr.args[0];
          if (target && target.kind === "ident") {
            const targetType = this.scope.get(target.name)?.type;
            if (targetType?.kind === "array") return targetType.elem;
          }
          return INT_TYPE;
        }
        if (expr.fn === "bossbar_get_value") {
          return INT_TYPE;
        }
        if (expr.fn === "random_sequence") {
          return VOID_TYPE;
        }
        const varType = this.scope.get(expr.fn)?.type;
        if (varType?.kind === "function_type") {
          return varType.return;
        }
        const implMethod = this.resolveInstanceMethod(expr);
        if (implMethod) {
          return this.normalizeType(implMethod.returnType);
        }
        const fn = this.functions.get(expr.fn);
        if (fn) {
          if (fn.typeParams && fn.typeParams.length > 0) {
            return expectedType ?? INT_TYPE;
          }
          return this.normalizeType(fn.returnType);
        }
        return INT_TYPE;
      }
      case "static_call": {
        const method = this.implMethods.get(expr.type)?.get(expr.method);
        return method ? this.normalizeType(method.returnType) : { kind: "named", name: "void" };
      }
      case "invoke": {
        const calleeType = this.inferType(expr.callee);
        if (calleeType.kind === "function_type") {
          return calleeType.return;
        }
        return { kind: "named", name: "void" };
      }
      case "path_expr":
        if (this.enums.has(expr.enumName)) {
          return { kind: "enum", name: expr.enumName };
        }
        return { kind: "named", name: "void" };
      case "enum_construct":
        if (this.enums.has(expr.enumName)) {
          return { kind: "enum", name: expr.enumName };
        }
        return { kind: "named", name: "void" };
      case "member":
        if (expr.obj.kind === "ident" && this.enums.has(expr.obj.name)) {
          return { kind: "enum", name: expr.obj.name };
        }
        if (expr.obj.kind === "ident") {
          const objTypeNode = this.scope.get(expr.obj.name)?.type;
          if (objTypeNode?.kind === "array" && expr.field === "len") {
            return { kind: "named", name: "int" };
          }
        }
        return { kind: "named", name: "void" };
      case "index": {
        const objType = this.inferType(expr.obj);
        if (objType.kind === "array") return objType.elem;
        return { kind: "named", name: "void" };
      }
      case "binary":
        if (["==", "!=", "<", "<=", ">", ">=", "&&", "||"].includes(expr.op)) {
          return { kind: "named", name: "bool" };
        }
        return this.inferType(expr.left);
      case "is_check":
        return { kind: "named", name: "bool" };
      case "unary":
        if (expr.op === "!") return { kind: "named", name: "bool" };
        return this.inferType(expr.operand);
      case "selector": {
        const entityType = this.inferEntityTypeFromSelector(expr.sel);
        return { kind: "selector", entityType: entityType ?? void 0 };
      }
      case "array_lit":
        if (expr.elements.length > 0) {
          return { kind: "array", elem: this.inferType(expr.elements[0]) };
        }
        return { kind: "array", elem: { kind: "named", name: "int" } };
      case "struct_lit":
        if (expectedType) {
          const normalized = this.normalizeType(expectedType);
          if (normalized.kind === "struct") {
            return normalized;
          }
        }
        return { kind: "named", name: "void" };
      case "tuple_lit":
        return {
          kind: "tuple",
          elements: expr.elements.map((e) => this.inferType(e))
        };
      case "some_lit": {
        const innerType = this.inferType(
          expr.value,
          expectedType?.kind === "option" ? expectedType.inner : void 0
        );
        return { kind: "option", inner: innerType };
      }
      case "none_lit": {
        if (expectedType?.kind === "option") return expectedType;
        return { kind: "option", inner: { kind: "named", name: "void" } };
      }
      case "type_cast":
        return this.normalizeType(expr.targetType);
      case "lambda":
        return this.inferLambdaType(
          expr,
          expectedType && this.normalizeType(expectedType).kind === "function_type" ? this.normalizeType(expectedType) : void 0
        );
      default:
        return { kind: "named", name: "void" };
    }
  }
  inferLambdaType(expr, expectedType) {
    const params = expr.params.map((param, index) => {
      if (param.type) {
        return this.normalizeType(param.type);
      }
      const inferred = expectedType?.params[index];
      if (inferred) {
        return inferred;
      }
      this.report(`Lambda parameter '${param.name}' requires a type annotation`, expr);
      return { kind: "named", name: "void" };
    });
    let returnType = expr.returnType ? this.normalizeType(expr.returnType) : expectedType?.return;
    if (!returnType) {
      returnType = Array.isArray(expr.body) ? { kind: "named", name: "void" } : this.inferType(expr.body);
    }
    return { kind: "function_type", params, return: returnType };
  }
  // ---------------------------------------------------------------------------
  // Entity Type Helpers
  // ---------------------------------------------------------------------------
  /** Infer entity type from a selector */
  inferEntityTypeFromSelector(selector) {
    if (selector.kind === "@a" || selector.kind === "@p" || selector.kind === "@r") {
      return "Player";
    }
    if (selector.filters?.type) {
      const mcType = selector.filters.type.toLowerCase();
      return MC_TYPE_TO_ENTITY[mcType] ?? "entity";
    }
    if (selector.kind === "@s") {
      return this.selfTypeStack[this.selfTypeStack.length - 1];
    }
    return "entity";
  }
  static {
    // Reverse map: parser sometimes remaps method names (e.g. add→set_add) for builtins.
    // When the receiver is a struct with an impl method matching the original name, use that.
    this.PARSER_METHOD_REMAP = {
      "set_add": "add",
      "set_contains": "contains",
      "set_remove": "remove",
      "set_clear": "clear",
      "__array_push": "push",
      "__array_pop": "pop",
      "__entity_tag": "tag",
      "__entity_untag": "untag",
      "__entity_has_tag": "has_tag"
    };
  }
  resolveInstanceMethod(expr) {
    const receiver = expr.args[0];
    if (!receiver) {
      return null;
    }
    const receiverType = this.inferType(receiver);
    if (receiverType.kind !== "struct") {
      return null;
    }
    const methodName = _TypeChecker.PARSER_METHOD_REMAP[expr.fn] ?? expr.fn;
    const method = this.implMethods.get(receiverType.name)?.get(expr.fn) ?? this.implMethods.get(receiverType.name)?.get(methodName);
    if (!method || method.params[0]?.name !== "self") {
      return null;
    }
    return method;
  }
  /** Check if childType is a subtype of parentType */
  isEntitySubtype(childType, parentType) {
    if (childType === parentType) return true;
    let current = childType;
    while (current !== null) {
      if (current === parentType) return true;
      current = ENTITY_HIERARCHY[current];
    }
    return false;
  }
  /** Push a new self type context */
  pushSelfType(entityType) {
    this.selfTypeStack.push(entityType);
  }
  /** Pop self type context */
  popSelfType() {
    if (this.selfTypeStack.length > 1) {
      this.selfTypeStack.pop();
    }
  }
  /** Get current @s type */
  getCurrentSelfType() {
    return this.selfTypeStack[this.selfTypeStack.length - 1];
  }
  /** Returns true if expected/actual are a numeric type mismatch (int vs float/fixed/double).
   * These pairs are NOT implicitly compatible — require explicit `as` cast.
   * Only int↔byte/short/long remain implicitly compatible (MC NBT narrowing). */
  isNumericMismatch(expected, actual) {
    if (expected.kind !== "named" || actual.kind !== "named") return false;
    const numericPairs = [
      ["int", "float"],
      ["float", "int"],
      ["int", "fixed"],
      ["fixed", "int"],
      ["int", "double"],
      ["double", "int"],
      ["float", "double"],
      ["double", "float"],
      ["fixed", "double"],
      ["double", "fixed"]
      // float and fixed are compatible (float is deprecated alias for fixed)
    ];
    return numericPairs.some(([e, a]) => expected.name === e && actual.name === a);
  }
  typesMatch(expected, actual) {
    if (expected.kind === "named" && expected.name === "int" && actual.kind === "enum") {
      return true;
    }
    if (expected.kind === "enum" && actual.kind === "named" && actual.name === "int") {
      return true;
    }
    if (expected.kind === "selector" && actual.kind === "entity") {
      return true;
    }
    if (expected.kind === "entity" && actual.kind === "selector") {
      return true;
    }
    if (expected.kind === "entity" && actual.kind === "entity") {
      return this.isEntitySubtype(actual.entityType, expected.entityType);
    }
    if (expected.kind === "selector" && actual.kind === "selector") {
      return true;
    }
    if (expected.kind !== actual.kind) return false;
    if (expected.kind === "named" && actual.kind === "named") {
      if (actual.name === "void") return true;
      if (expected.name === actual.name) return true;
      const floatFixed = (expected.name === "float" || expected.name === "fixed") && (actual.name === "float" || actual.name === "fixed");
      if (floatFixed) return true;
      const nbtNarrowing = [
        ["int", "byte"],
        ["byte", "int"],
        ["int", "short"],
        ["short", "int"],
        ["int", "long"],
        ["long", "int"]
      ];
      if (nbtNarrowing.some(([e, a]) => expected.name === e && actual.name === a)) return true;
      return false;
    }
    if (expected.kind === "array" && actual.kind === "array") {
      return this.typesMatch(expected.elem, actual.elem);
    }
    if (expected.kind === "struct" && actual.kind === "struct") {
      return expected.name === actual.name;
    }
    if (expected.kind === "enum" && actual.kind === "enum") {
      return expected.name === actual.name;
    }
    if (expected.kind === "function_type" && actual.kind === "function_type") {
      return expected.params.length === actual.params.length && expected.params.every((param, index) => this.typesMatch(param, actual.params[index])) && this.typesMatch(expected.return, actual.return);
    }
    if (expected.kind === "tuple" && actual.kind === "tuple") {
      return expected.elements.length === actual.elements.length && expected.elements.every((elem, i) => this.typesMatch(elem, actual.elements[i]));
    }
    if (expected.kind === "option" && actual.kind === "option") {
      return this.typesMatch(expected.inner, actual.inner);
    }
    if (expected.kind === "option" && actual.kind === "named" && actual.name === "void") {
      return true;
    }
    return false;
  }
  typeToString(type) {
    switch (type.kind) {
      case "named":
        return type.name;
      case "array":
        return `${this.typeToString(type.elem)}[]`;
      case "struct":
        return type.name;
      case "enum":
        return type.name;
      case "function_type":
        return `(${type.params.map((param) => this.typeToString(param)).join(", ")}) -> ${this.typeToString(type.return)}`;
      case "entity":
        return type.entityType;
      case "selector":
        return "selector";
      case "tuple":
        return `(${type.elements.map((e) => this.typeToString(e)).join(", ")})`;
      case "option":
        return `Option<${this.typeToString(type.inner)}>`;
      default:
        return "unknown";
    }
  }
  normalizeType(type) {
    if (type.kind === "array") {
      return { kind: "array", elem: this.normalizeType(type.elem) };
    }
    if (type.kind === "option") {
      return { kind: "option", inner: this.normalizeType(type.inner) };
    }
    if (type.kind === "tuple") {
      return { kind: "tuple", elements: type.elements.map((e) => this.normalizeType(e)) };
    }
    if (type.kind === "function_type") {
      return {
        kind: "function_type",
        params: type.params.map((param) => this.normalizeType(param)),
        return: this.normalizeType(type.return)
      };
    }
    if ((type.kind === "struct" || type.kind === "enum") && this.enums.has(type.name)) {
      return { kind: "enum", name: type.name };
    }
    if (type.kind === "struct" && type.name in ENTITY_HIERARCHY) {
      return { kind: "entity", entityType: type.name };
    }
    if (type.kind === "named" && type.name in ENTITY_HIERARCHY) {
      return { kind: "entity", entityType: type.name };
    }
    return type;
  }
};

// ../../src/builtins/metadata.ts
var BUILTIN_METADATA = {
  // -------------------------------------------------------------------------
  // Chat & Display
  // -------------------------------------------------------------------------
  say: {
    name: "say",
    params: [
      { name: "message", type: "string", required: true, doc: "Message to broadcast to all players", docZh: "\u5411\u6240\u6709\u73A9\u5BB6\u5E7F\u64AD\u7684\u6D88\u606F" }
    ],
    returns: "void",
    doc: "Displays a message to all players in chat as the server.",
    docZh: "\u4EE5\u670D\u52A1\u5668\u540D\u4E49\u5411\u6240\u6709\u73A9\u5BB6\u53D1\u9001\u804A\u5929\u6D88\u606F\u3002",
    examples: ['say("Hello, world!");', 'say("Game has started!");'],
    compilesTo: "say <message>",
    category: "chat"
  },
  tell: {
    name: "tell",
    params: [
      { name: "target", type: "selector", required: true, doc: "Target player or entity selector", docZh: "\u76EE\u6807\u73A9\u5BB6\u6216\u5B9E\u4F53\u9009\u62E9\u5668" },
      { name: "message", type: "string", required: true, doc: "Message to send privately", docZh: "\u79C1\u4FE1\u5185\u5BB9" }
    ],
    returns: "void",
    doc: "Sends a private message to a player or selector using tellraw.",
    docZh: "\u4F7F\u7528 tellraw \u5411\u73A9\u5BB6\u6216\u9009\u62E9\u5668\u53D1\u9001\u79C1\u4FE1\u3002",
    examples: ['tell(@s, "You won!");', 'tell(@a[tag=vip], "Welcome, VIP!");'],
    compilesTo: 'tellraw <target> {"text":"<message>"}',
    category: "chat"
  },
  tellraw: {
    name: "tellraw",
    params: [
      { name: "target", type: "selector", required: true, doc: "Target player or entity selector", docZh: "\u76EE\u6807\u73A9\u5BB6\u6216\u5B9E\u4F53\u9009\u62E9\u5668" },
      { name: "message", type: "string", required: true, doc: "Message text (supports f-string interpolation)", docZh: "\u6D88\u606F\u6587\u672C\uFF08\u652F\u6301\u683C\u5F0F\u5316\u5B57\u7B26\u4E32\u63D2\u503C\uFF09" }
    ],
    returns: "void",
    doc: "Alias for tell(). Sends a raw text message using tellraw.",
    docZh: "tell() \u7684\u522B\u540D\uFF0C\u4F7F\u7528 tellraw \u53D1\u9001\u539F\u59CB\u6587\u672C\u6D88\u606F\u3002",
    examples: ['tellraw(@s, "Hello!");'],
    compilesTo: 'tellraw <target> {"text":"<message>"}',
    category: "chat"
  },
  announce: {
    name: "announce",
    params: [
      { name: "message", type: "string", required: true, doc: "Message to broadcast", docZh: "\u5E7F\u64AD\u6D88\u606F\u5185\u5BB9" }
    ],
    returns: "void",
    doc: "Sends a message to all players in chat (@a).",
    docZh: "\u5411\u6240\u6709\u73A9\u5BB6\uFF08@a\uFF09\u53D1\u9001\u804A\u5929\u6D88\u606F\u3002",
    examples: ['announce("Round 1 starts in 3 seconds!");'],
    compilesTo: 'tellraw @a {"text":"<message>"}',
    category: "chat"
  },
  title: {
    name: "title",
    params: [
      { name: "target", type: "selector", required: true, doc: "Target player(s)", docZh: "\u76EE\u6807\u73A9\u5BB6" },
      { name: "message", type: "string", required: true, doc: "Title text to display", docZh: "\u6807\u9898\u6587\u5B57" }
    ],
    returns: "void",
    doc: "Shows a large title on screen for target players.",
    docZh: "\u4E3A\u76EE\u6807\u73A9\u5BB6\u5728\u5C4F\u5E55\u4E0A\u663E\u793A\u5927\u6807\u9898\u3002",
    examples: ['title(@a, "Round 1");', 'title(@s, "You Win!");'],
    compilesTo: 'title <target> title {"text":"<message>"}',
    category: "chat"
  },
  subtitle: {
    name: "subtitle",
    params: [
      { name: "target", type: "selector", required: true, doc: "Target player(s)", docZh: "\u76EE\u6807\u73A9\u5BB6" },
      { name: "message", type: "string", required: true, doc: "Subtitle text (appears below title)", docZh: "\u526F\u6807\u9898\u6587\u5B57\uFF08\u663E\u793A\u5728\u4E3B\u6807\u9898\u4E0B\u65B9\uFF09" }
    ],
    returns: "void",
    doc: "Shows subtitle text below the main title on screen.",
    docZh: "\u5728\u5C4F\u5E55\u4E3B\u6807\u9898\u4E0B\u65B9\u663E\u793A\u526F\u6807\u9898\u6587\u5B57\u3002",
    examples: ['subtitle(@a, "Fight!");'],
    compilesTo: 'title <target> subtitle {"text":"<message>"}',
    category: "chat"
  },
  actionbar: {
    name: "actionbar",
    params: [
      { name: "target", type: "selector", required: true, doc: "Target player(s)", docZh: "\u76EE\u6807\u73A9\u5BB6" },
      { name: "message", type: "string", required: true, doc: "Action bar text (above hotbar)", docZh: "\u52A8\u4F5C\u680F\u6587\u5B57\uFF08\u5FEB\u6377\u680F\u4E0A\u65B9\uFF09" }
    ],
    returns: "void",
    doc: "Displays text in the action bar (above the hotbar).",
    docZh: "\u5728\u52A8\u4F5C\u680F\uFF08\u5FEB\u6377\u680F\u4E0A\u65B9\uFF09\u663E\u793A\u6587\u5B57\u3002",
    examples: ['actionbar(@a, "\u23F1 ${time}s remaining");'],
    compilesTo: 'title <target> actionbar {"text":"<message>"}',
    category: "chat"
  },
  title_times: {
    name: "title_times",
    params: [
      { name: "target", type: "selector", required: true, doc: "Target player(s)", docZh: "\u76EE\u6807\u73A9\u5BB6" },
      { name: "fadeIn", type: "int", required: true, doc: "Fade-in duration in ticks", docZh: "\u6DE1\u5165\u65F6\u957F\uFF08tick\uFF09" },
      { name: "stay", type: "int", required: true, doc: "Stay duration in ticks", docZh: "\u505C\u7559\u65F6\u957F\uFF08tick\uFF09" },
      { name: "fadeOut", type: "int", required: true, doc: "Fade-out duration in ticks", docZh: "\u6DE1\u51FA\u65F6\u957F\uFF08tick\uFF09" }
    ],
    returns: "void",
    doc: "Sets title display timing in ticks. 20 ticks = 1 second.",
    docZh: "\u8BBE\u7F6E\u6807\u9898\u663E\u793A\u65F6\u95F4\uFF08\u4EE5 tick \u4E3A\u5355\u4F4D\uFF09\uFF0C20 tick = 1 \u79D2\u3002",
    examples: ["title_times(@a, 10, 40, 10);", "// Show for 2 seconds\ntitle_times(@a, 5, 40, 5);"],
    compilesTo: "title <target> times <fadeIn> <stay> <fadeOut>",
    category: "chat"
  },
  // -------------------------------------------------------------------------
  // Player
  // -------------------------------------------------------------------------
  give: {
    name: "give",
    params: [
      { name: "target", type: "selector", required: true, doc: "Target player(s)", docZh: "\u76EE\u6807\u73A9\u5BB6" },
      { name: "item", type: "item", required: true, doc: 'Item ID (e.g. "minecraft:diamond")', docZh: '\u7269\u54C1 ID\uFF08\u5982 "minecraft:diamond"\uFF09' },
      { name: "count", type: "int", required: false, default: "1", doc: "Number of items to give", docZh: "\u7ED9\u4E88\u7269\u54C1\u6570\u91CF" },
      { name: "nbt", type: "nbt", required: false, doc: "Optional NBT data for the item", docZh: "\u53EF\u9009\u7684 NBT \u6570\u636E" }
    ],
    returns: "void",
    doc: "Gives item(s) to a player.",
    docZh: "\u7ED9\u4E88\u73A9\u5BB6\u7269\u54C1\u3002",
    examples: [
      'give(@s, "minecraft:diamond", 5);',
      'give(@a, "minecraft:apple");',
      'give(@s, "minecraft:diamond_sword", 1, "{Enchantments:[{id:\\"minecraft:sharpness\\",lvl:5s}]}");'
    ],
    compilesTo: "give <target> <item>[nbt] [count]",
    category: "player"
  },
  kill: {
    name: "kill",
    params: [
      { name: "target", type: "selector", required: false, default: "@s", doc: "Target to kill (default: @s)", docZh: "\u51FB\u6740\u76EE\u6807\uFF08\u9ED8\u8BA4\uFF1A@s\uFF09" }
    ],
    returns: "void",
    doc: "Kills the target entity. Defaults to the executing entity (@s).",
    docZh: "\u51FB\u6740\u76EE\u6807\u5B9E\u4F53\uFF0C\u9ED8\u8BA4\u51FB\u6740\u5F53\u524D\u6267\u884C\u5B9E\u4F53\uFF08@s\uFF09\u3002",
    examples: ["kill(@e[type=minecraft:zombie]);", "kill(@s);", "kill(@e[tag=enemy]);"],
    compilesTo: "kill [target]",
    category: "player"
  },
  effect: {
    name: "effect",
    params: [
      { name: "target", type: "selector", required: true, doc: "Target entity or player", docZh: "\u76EE\u6807\u5B9E\u4F53\u6216\u73A9\u5BB6" },
      { name: "effect", type: "effect", required: true, doc: 'Effect ID (e.g. "minecraft:speed")', docZh: '\u836F\u6C34\u6548\u679C ID\uFF08\u5982 "minecraft:speed"\uFF09' },
      { name: "duration", type: "int", required: false, default: "30", doc: "Duration in seconds", docZh: "\u6301\u7EED\u65F6\u95F4\uFF08\u79D2\uFF09" },
      { name: "amplifier", type: "int", required: false, default: "0", doc: "Effect level (0-255, where 0 = level 1)", docZh: "\u6548\u679C\u7B49\u7EA7\uFF080-255\uFF0C0 \u4EE3\u8868\u7B49\u7EA7 1\uFF09" }
    ],
    returns: "void",
    doc: "Applies a status effect to an entity.",
    docZh: "\u4E3A\u5B9E\u4F53\u5E94\u7528\u836F\u6C34\u72B6\u6001\u6548\u679C\u3002",
    examples: [
      'effect(@s, "minecraft:speed", 60, 1);',
      'effect(@a, "minecraft:regeneration", 10);',
      'effect(@e[type=minecraft:zombie], "minecraft:slowness", 20, 2);'
    ],
    compilesTo: "effect give <target> <effect> [duration] [amplifier]",
    category: "player"
  },
  effect_clear: {
    name: "effect_clear",
    params: [
      { name: "target", type: "selector", required: true, doc: "Target entity or player", docZh: "\u76EE\u6807\u5B9E\u4F53\u6216\u73A9\u5BB6" },
      { name: "effect", type: "effect", required: false, doc: "Effect to remove (omit to clear all)", docZh: "\u8981\u6E05\u9664\u7684\u6548\u679C\uFF08\u7701\u7565\u5219\u6E05\u9664\u6240\u6709\uFF09" }
    ],
    returns: "void",
    doc: "Removes a status effect from an entity, or clears all effects.",
    docZh: "\u79FB\u9664\u5B9E\u4F53\u7684\u836F\u6C34\u6548\u679C\uFF0C\u7701\u7565 effect \u53C2\u6570\u5219\u6E05\u9664\u6240\u6709\u6548\u679C\u3002",
    examples: ['effect_clear(@s, "minecraft:poison");', "effect_clear(@a);"],
    compilesTo: "effect clear <target> [effect]",
    category: "player"
  },
  clear: {
    name: "clear",
    params: [
      { name: "target", type: "selector", required: true, doc: "Target player", docZh: "\u76EE\u6807\u73A9\u5BB6" },
      { name: "item", type: "item", required: false, doc: "Specific item to remove (omit to clear all)", docZh: "\u8981\u6E05\u9664\u7684\u7269\u54C1\uFF08\u7701\u7565\u5219\u6E05\u9664\u6240\u6709\uFF09" }
    ],
    returns: "void",
    doc: "Removes items from a player's inventory.",
    docZh: "\u6E05\u9664\u73A9\u5BB6\u80CC\u5305\u4E2D\u7684\u7269\u54C1\u3002",
    examples: ['clear(@s, "minecraft:dirt");', "clear(@a);"],
    compilesTo: "clear <target> [item]",
    category: "player"
  },
  kick: {
    name: "kick",
    params: [
      { name: "player", type: "selector", required: true, doc: "Target player to kick", docZh: "\u8981\u8E22\u51FA\u7684\u73A9\u5BB6" },
      { name: "reason", type: "string", required: false, doc: "Kick message shown to the player", docZh: "\u8E22\u51FA\u539F\u56E0\uFF08\u663E\u793A\u7ED9\u73A9\u5BB6\uFF09" }
    ],
    returns: "void",
    doc: "Kicks a player from the server with an optional reason.",
    docZh: "\u5C06\u73A9\u5BB6\u8E22\u51FA\u670D\u52A1\u5668\uFF0C\u53EF\u9644\u52A0\u539F\u56E0\u3002",
    examples: ['kick(@s, "You lost!");', 'kick(@p, "AFK too long");'],
    compilesTo: "kick <player> [reason]",
    category: "player"
  },
  xp_add: {
    name: "xp_add",
    params: [
      { name: "target", type: "selector", required: true, doc: "Target player", docZh: "\u76EE\u6807\u73A9\u5BB6" },
      { name: "amount", type: "int", required: true, doc: "Amount of XP to add", docZh: "\u589E\u52A0\u7684\u7ECF\u9A8C\u503C\u6570\u91CF" },
      { name: "type", type: "string", required: false, default: "points", doc: '"points" or "levels"', docZh: '"points"\uFF08\u7ECF\u9A8C\u70B9\uFF09\u6216 "levels"\uFF08\u7B49\u7EA7\uFF09' }
    ],
    returns: "void",
    doc: "Adds experience points or levels to a player.",
    docZh: "\u7ED9\u73A9\u5BB6\u589E\u52A0\u7ECF\u9A8C\u70B9\u6216\u7B49\u7EA7\u3002",
    examples: ["xp_add(@s, 100);", 'xp_add(@s, 5, "levels");'],
    compilesTo: "xp add <target> <amount> [type]",
    category: "player"
  },
  xp_set: {
    name: "xp_set",
    params: [
      { name: "target", type: "selector", required: true, doc: "Target player", docZh: "\u76EE\u6807\u73A9\u5BB6" },
      { name: "amount", type: "int", required: true, doc: "New XP value", docZh: "\u65B0\u7684\u7ECF\u9A8C\u503C" },
      { name: "type", type: "string", required: false, default: "points", doc: '"points" or "levels"', docZh: '"points"\uFF08\u7ECF\u9A8C\u70B9\uFF09\u6216 "levels"\uFF08\u7B49\u7EA7\uFF09' }
    ],
    returns: "void",
    doc: "Sets a player's experience points or levels.",
    docZh: "\u8BBE\u7F6E\u73A9\u5BB6\u7684\u7ECF\u9A8C\u70B9\u6216\u7B49\u7EA7\u3002",
    examples: ['xp_set(@s, 0, "levels");', "xp_set(@s, 500);"],
    compilesTo: "xp set <target> <amount> [type]",
    category: "player"
  },
  // -------------------------------------------------------------------------
  // Teleport
  // -------------------------------------------------------------------------
  tp: {
    name: "tp",
    params: [
      { name: "target", type: "selector", required: true, doc: "Entity to teleport", docZh: "\u8981\u4F20\u9001\u7684\u5B9E\u4F53" },
      { name: "destination", type: "selector", required: true, doc: "Target player or BlockPos coordinates", docZh: "\u76EE\u6807\u73A9\u5BB6\u6216\u65B9\u5757\u5750\u6807" }
    ],
    returns: "void",
    doc: "Teleports an entity to a player or position.",
    docZh: "\u5C06\u5B9E\u4F53\u4F20\u9001\u5230\u6307\u5B9A\u73A9\u5BB6\u6216\u5750\u6807\u3002",
    examples: ["tp(@s, (0, 64, 0));", "tp(@a, @s);", "tp(@s, (~0, ~10, ~0));"],
    compilesTo: "tp <target> <destination>",
    category: "world"
  },
  tp_to: {
    name: "tp_to",
    params: [
      { name: "target", type: "selector", required: true, doc: "Entity to teleport", docZh: "\u8981\u4F20\u9001\u7684\u5B9E\u4F53" },
      { name: "destination", type: "selector", required: true, doc: "Target player or position", docZh: "\u76EE\u6807\u73A9\u5BB6\u6216\u4F4D\u7F6E" }
    ],
    returns: "void",
    doc: "@deprecated Use tp() instead. Teleports an entity to a position.",
    docZh: "@deprecated \u8BF7\u4F7F\u7528 tp()\u3002\u5C06\u5B9E\u4F53\u4F20\u9001\u5230\u6307\u5B9A\u4F4D\u7F6E\u3002",
    examples: ["tp(@s, (0, 64, 0));  // use tp instead"],
    compilesTo: "tp <target> <destination>",
    category: "world"
  },
  // -------------------------------------------------------------------------
  // World & Block
  // -------------------------------------------------------------------------
  setblock: {
    name: "setblock",
    params: [
      { name: "pos", type: "BlockPos", required: true, doc: "Block position, e.g. (0, 64, 0) or (~1, ~0, ~0)", docZh: "\u65B9\u5757\u5750\u6807\uFF0C\u4F8B\u5982 (0, 64, 0) \u6216 (~1, ~0, ~0)" },
      { name: "block", type: "block", required: true, doc: 'Block ID (e.g. "minecraft:stone")', docZh: '\u65B9\u5757 ID\uFF08\u5982 "minecraft:stone"\uFF09' }
    ],
    returns: "void",
    doc: "Places a block at the specified coordinates.",
    docZh: "\u5728\u6307\u5B9A\u5750\u6807\u653E\u7F6E\u65B9\u5757\u3002",
    examples: ['setblock((0, 64, 0), "minecraft:stone");', 'setblock((~1, ~0, ~0), "minecraft:air");'],
    compilesTo: "setblock <x> <y> <z> <block>",
    category: "world"
  },
  fill: {
    name: "fill",
    params: [
      { name: "from", type: "BlockPos", required: true, doc: "Start corner of the region", docZh: "\u533A\u57DF\u8D77\u59CB\u89D2\u843D" },
      { name: "to", type: "BlockPos", required: true, doc: "End corner of the region", docZh: "\u533A\u57DF\u7ED3\u675F\u89D2\u843D" },
      { name: "block", type: "block", required: true, doc: "Block to fill with", docZh: "\u7528\u4E8E\u586B\u5145\u7684\u65B9\u5757" }
    ],
    returns: "void",
    doc: "Fills a cuboid region with a specified block.",
    docZh: "\u7528\u6307\u5B9A\u65B9\u5757\u586B\u5145\u4E00\u4E2A\u7ACB\u65B9\u4F53\u533A\u57DF\u3002",
    examples: [
      'fill((0, 64, 0), (10, 64, 10), "minecraft:grass_block");',
      'fill((~-5, ~-1, ~-5), (~5, ~-1, ~5), "minecraft:bedrock");'
    ],
    compilesTo: "fill <x1> <y1> <z1> <x2> <y2> <z2> <block>",
    category: "world"
  },
  clone: {
    name: "clone",
    params: [
      { name: "from", type: "BlockPos", required: true, doc: "Source region start corner", docZh: "\u6E90\u533A\u57DF\u8D77\u59CB\u89D2\u843D" },
      { name: "to", type: "BlockPos", required: true, doc: "Source region end corner", docZh: "\u6E90\u533A\u57DF\u7ED3\u675F\u89D2\u843D" },
      { name: "dest", type: "BlockPos", required: true, doc: "Destination corner", docZh: "\u76EE\u6807\u89D2\u843D" }
    ],
    returns: "void",
    doc: "Clones a region of blocks to a new location.",
    docZh: "\u5C06\u4E00\u4E2A\u533A\u57DF\u7684\u65B9\u5757\u590D\u5236\u5230\u65B0\u7684\u4F4D\u7F6E\u3002",
    examples: ["clone((0,64,0), (10,64,10), (20,64,0));"],
    compilesTo: "clone <x1> <y1> <z1> <x2> <y2> <z2> <dx> <dy> <dz>",
    category: "world"
  },
  summon: {
    name: "summon",
    params: [
      { name: "type", type: "entity", required: true, doc: 'Entity type ID (e.g. "minecraft:zombie")', docZh: '\u5B9E\u4F53\u7C7B\u578B ID\uFF08\u5982 "minecraft:zombie"\uFF09' },
      { name: "x", type: "coord", required: false, default: "~", doc: "X coordinate (default: ~)", docZh: "X \u5750\u6807\uFF08\u9ED8\u8BA4\uFF1A~\uFF09" },
      { name: "y", type: "coord", required: false, default: "~", doc: "Y coordinate (default: ~)", docZh: "Y \u5750\u6807\uFF08\u9ED8\u8BA4\uFF1A~\uFF09" },
      { name: "z", type: "coord", required: false, default: "~", doc: "Z coordinate (default: ~)", docZh: "Z \u5750\u6807\uFF08\u9ED8\u8BA4\uFF1A~\uFF09" },
      { name: "nbt", type: "nbt", required: false, doc: "Optional NBT data for the entity", docZh: "\u53EF\u9009\u7684\u5B9E\u4F53 NBT \u6570\u636E" }
    ],
    returns: "void",
    doc: "Summons an entity at the specified position.",
    docZh: "\u5728\u6307\u5B9A\u4F4D\u7F6E\u751F\u6210\u5B9E\u4F53\u3002",
    examples: [
      'summon("minecraft:zombie", ~0, ~0, ~0);',
      'summon("minecraft:armor_stand", (0, 64, 0));',
      'summon("minecraft:zombie", ~0, ~0, ~0, "{CustomName:\\"Boss\\"}");'
    ],
    compilesTo: "summon <type> <x> <y> <z> [nbt]",
    category: "world"
  },
  particle: {
    name: "particle",
    params: [
      { name: "name", type: "string", required: true, doc: 'Particle type ID (e.g. "minecraft:flame")', docZh: '\u7C92\u5B50\u7C7B\u578B ID\uFF08\u5982 "minecraft:flame"\uFF09' },
      { name: "x", type: "coord", required: false, default: "~", doc: "X coordinate", docZh: "X \u5750\u6807" },
      { name: "y", type: "coord", required: false, default: "~", doc: "Y coordinate", docZh: "Y \u5750\u6807" },
      { name: "z", type: "coord", required: false, default: "~", doc: "Z coordinate", docZh: "Z \u5750\u6807" }
    ],
    returns: "void",
    doc: "Spawns a particle effect at the specified position.",
    docZh: "\u5728\u6307\u5B9A\u4F4D\u7F6E\u751F\u6210\u7C92\u5B50\u6548\u679C\u3002",
    examples: ['particle("minecraft:flame", (~0, ~1, ~0));', 'particle("minecraft:explosion", (0, 100, 0));'],
    compilesTo: "particle <name> <x> <y> <z>",
    category: "world"
  },
  playsound: {
    name: "playsound",
    params: [
      { name: "sound", type: "sound", required: true, doc: 'Sound event ID (e.g. "entity.experience_orb.pickup")', docZh: '\u97F3\u6548\u4E8B\u4EF6 ID\uFF08\u5982 "entity.experience_orb.pickup"\uFF09' },
      { name: "source", type: "string", required: true, doc: 'Sound category: "master", "music", "record", "weather", "block", "hostile", "neutral", "player", "ambient", "voice"', docZh: "\u97F3\u6548\u5206\u7C7B\uFF1Amaster/music/record/weather/block/hostile/neutral/player/ambient/voice" },
      { name: "target", type: "selector", required: true, doc: "Target player to hear the sound", docZh: "\u63A5\u6536\u97F3\u6548\u7684\u76EE\u6807\u73A9\u5BB6" },
      { name: "x", type: "coord", required: false, doc: "X origin position", docZh: "X \u8D77\u6E90\u5750\u6807" },
      { name: "y", type: "coord", required: false, doc: "Y origin position", docZh: "Y \u8D77\u6E90\u5750\u6807" },
      { name: "z", type: "coord", required: false, doc: "Z origin position", docZh: "Z \u8D77\u6E90\u5750\u6807" },
      { name: "volume", type: "float", required: false, default: "1.0", doc: "Volume (default: 1.0)", docZh: "\u97F3\u91CF\uFF08\u9ED8\u8BA4\uFF1A1.0\uFF09" },
      { name: "pitch", type: "float", required: false, default: "1.0", doc: "Pitch (default: 1.0)", docZh: "\u97F3\u8C03\uFF08\u9ED8\u8BA4\uFF1A1.0\uFF09" },
      { name: "minVolume", type: "float", required: false, doc: "Minimum volume for distant players", docZh: "\u8FDC\u5904\u73A9\u5BB6\u7684\u6700\u5C0F\u97F3\u91CF" }
    ],
    returns: "void",
    doc: "Plays a sound effect for target players.",
    docZh: "\u4E3A\u76EE\u6807\u73A9\u5BB6\u64AD\u653E\u97F3\u6548\u3002",
    examples: [
      'playsound("entity.experience_orb.pickup", "player", @s);',
      'playsound("ui.toast.challenge_complete", "master", @a);'
    ],
    compilesTo: "playsound <sound> <source> <target> [x] [y] [z] [volume] [pitch] [minVolume]",
    category: "world"
  },
  weather: {
    name: "weather",
    params: [
      { name: "type", type: "string", required: true, doc: '"clear", "rain", or "thunder"', docZh: '"clear"\uFF08\u6674\u5929\uFF09\u3001"rain"\uFF08\u4E0B\u96E8\uFF09\u6216 "thunder"\uFF08\u96F7\u66B4\uFF09' }
    ],
    returns: "void",
    doc: "Sets the weather condition.",
    docZh: "\u8BBE\u7F6E\u5929\u6C14\u72B6\u6001\u3002",
    examples: ['weather("clear");', 'weather("thunder");'],
    compilesTo: "weather <type>",
    category: "world"
  },
  time_set: {
    name: "time_set",
    params: [
      { name: "value", type: "string", required: true, doc: 'Time in ticks, or "day"/"night"/"noon"/"midnight"', docZh: '\u65F6\u95F4\uFF08tick\uFF09\u6216 "day"/"night"/"noon"/"midnight"' }
    ],
    returns: "void",
    doc: "Sets the world time.",
    docZh: "\u8BBE\u7F6E\u4E16\u754C\u65F6\u95F4\u3002",
    examples: ['time_set(0);  // dawn\ntime_set("noon");', 'time_set("midnight");'],
    compilesTo: "time set <value>",
    category: "world"
  },
  time_add: {
    name: "time_add",
    params: [
      { name: "ticks", type: "int", required: true, doc: "Number of ticks to advance", docZh: "\u63A8\u8FDB\u7684 tick \u6570" }
    ],
    returns: "void",
    doc: "Advances the world time by a number of ticks.",
    docZh: "\u5C06\u4E16\u754C\u65F6\u95F4\u63A8\u8FDB\u6307\u5B9A\u7684 tick \u6570\u3002",
    examples: ["time_add(6000);  // advance by half a day"],
    compilesTo: "time add <ticks>",
    category: "world"
  },
  gamerule: {
    name: "gamerule",
    params: [
      { name: "rule", type: "string", required: true, doc: 'Gamerule name (e.g. "keepInventory")', docZh: '\u6E38\u620F\u89C4\u5219\u540D\u79F0\uFF08\u5982 "keepInventory"\uFF09' },
      { name: "value", type: "string", required: true, doc: "New value (true/false for boolean rules, integer for numeric)", docZh: "\u65B0\u503C\uFF08\u5E03\u5C14\u89C4\u5219\u4E3A true/false\uFF0C\u6570\u503C\u89C4\u5219\u4E3A\u6574\u6570\uFF09" }
    ],
    returns: "void",
    doc: "Sets a gamerule value.",
    docZh: "\u8BBE\u7F6E\u6E38\u620F\u89C4\u5219\u7684\u503C\u3002",
    examples: ['gamerule("keepInventory", true);', 'gamerule("randomTickSpeed", 3);'],
    compilesTo: "gamerule <rule> <value>",
    category: "world"
  },
  difficulty: {
    name: "difficulty",
    params: [
      { name: "level", type: "string", required: true, doc: '"peaceful", "easy", "normal", or "hard"', docZh: '"peaceful"\uFF08\u548C\u5E73\uFF09\u3001"easy"\uFF08\u7B80\u5355\uFF09\u3001"normal"\uFF08\u666E\u901A\uFF09\u6216 "hard"\uFF08\u56F0\u96BE\uFF09' }
    ],
    returns: "void",
    doc: "Sets the game difficulty.",
    docZh: "\u8BBE\u7F6E\u6E38\u620F\u96BE\u5EA6\u3002",
    examples: ['difficulty("hard");', 'difficulty("peaceful");'],
    compilesTo: "difficulty <level>",
    category: "world"
  },
  // -------------------------------------------------------------------------
  // Tags
  // -------------------------------------------------------------------------
  tag_add: {
    name: "tag_add",
    params: [
      { name: "target", type: "selector", required: true, doc: "Target entity", docZh: "\u76EE\u6807\u5B9E\u4F53" },
      { name: "tag", type: "string", required: true, doc: "Tag name to add", docZh: "\u8981\u6DFB\u52A0\u7684\u6807\u7B7E\u540D" }
    ],
    returns: "void",
    doc: "Adds a scoreboard tag to an entity.",
    docZh: "\u4E3A\u5B9E\u4F53\u6DFB\u52A0\u8BA1\u5206\u677F\u6807\u7B7E\u3002",
    examples: ['tag_add(@s, "hasKey");', 'tag_add(@e[type=minecraft:zombie], "boss");'],
    compilesTo: "tag <target> add <tag>",
    category: "entities"
  },
  tag_remove: {
    name: "tag_remove",
    params: [
      { name: "target", type: "selector", required: true, doc: "Target entity", docZh: "\u76EE\u6807\u5B9E\u4F53" },
      { name: "tag", type: "string", required: true, doc: "Tag name to remove", docZh: "\u8981\u79FB\u9664\u7684\u6807\u7B7E\u540D" }
    ],
    returns: "void",
    doc: "Removes a scoreboard tag from an entity.",
    docZh: "\u4ECE\u5B9E\u4F53\u8EAB\u4E0A\u79FB\u9664\u8BA1\u5206\u677F\u6807\u7B7E\u3002",
    examples: ['tag_remove(@s, "hasKey");'],
    compilesTo: "tag <target> remove <tag>",
    category: "entities"
  },
  // -------------------------------------------------------------------------
  // Scoreboard
  // -------------------------------------------------------------------------
  scoreboard_get: {
    name: "scoreboard_get",
    params: [
      { name: "target", type: "selector", required: true, doc: 'Player, entity, or fake player name (e.g. "#counter")', docZh: '\u73A9\u5BB6\u3001\u5B9E\u4F53\u6216\u865A\u62DF\u73A9\u5BB6\u540D\uFF08\u5982 "#counter"\uFF09' },
      { name: "objective", type: "string", required: true, doc: "Scoreboard objective name", docZh: "\u8BA1\u5206\u677F\u76EE\u6807\u540D\u79F0" }
    ],
    returns: "int",
    doc: "Reads a value from a vanilla MC scoreboard objective.",
    docZh: "\u4ECE\u539F\u7248 MC \u8BA1\u5206\u677F\u76EE\u6807\u8BFB\u53D6\u6570\u503C\u3002",
    examples: ['let hp: int = scoreboard_get(@s, "health");', 'let kills: int = scoreboard_get(@s, "kills");'],
    compilesTo: "scoreboard players get <target> <objective>",
    category: "scoreboard"
  },
  score: {
    name: "score",
    params: [
      { name: "target", type: "selector", required: true, doc: "Player, entity, or fake player name", docZh: "\u73A9\u5BB6\u3001\u5B9E\u4F53\u6216\u865A\u62DF\u73A9\u5BB6\u540D" },
      { name: "objective", type: "string", required: true, doc: "Scoreboard objective name", docZh: "\u8BA1\u5206\u677F\u76EE\u6807\u540D\u79F0" }
    ],
    returns: "int",
    doc: "Alias for scoreboard_get(). Reads a value from a scoreboard.",
    docZh: "scoreboard_get() \u7684\u522B\u540D\uFF0C\u4ECE\u8BA1\u5206\u677F\u8BFB\u53D6\u6570\u503C\u3002",
    examples: ['let kills: int = score(@s, "kills");'],
    compilesTo: "scoreboard players get <target> <objective>",
    category: "scoreboard"
  },
  scoreboard_set: {
    name: "scoreboard_set",
    params: [
      { name: "target", type: "selector", required: true, doc: "Player, entity, or fake player", docZh: "\u73A9\u5BB6\u3001\u5B9E\u4F53\u6216\u865A\u62DF\u73A9\u5BB6" },
      { name: "objective", type: "string", required: true, doc: "Objective name", docZh: "\u8BA1\u5206\u677F\u76EE\u6807\u540D\u79F0" },
      { name: "value", type: "int", required: true, doc: "New score value", docZh: "\u65B0\u7684\u5206\u6570\u503C" }
    ],
    returns: "void",
    doc: "Sets a value in a vanilla MC scoreboard objective.",
    docZh: "\u8BBE\u7F6E\u539F\u7248 MC \u8BA1\u5206\u677F\u76EE\u6807\u4E2D\u7684\u6570\u503C\u3002",
    examples: ['scoreboard_set("#game", "timer", 300);', 'scoreboard_set(@s, "lives", 3);'],
    compilesTo: "scoreboard players set <target> <objective> <value>",
    category: "scoreboard"
  },
  scoreboard_display: {
    name: "scoreboard_display",
    params: [
      { name: "slot", type: "string", required: true, doc: '"list", "sidebar", or "belowName"', docZh: '"list"\uFF08\u5217\u8868\uFF09\u3001"sidebar"\uFF08\u4FA7\u8FB9\u680F\uFF09\u6216 "belowName"\uFF08\u540D\u5B57\u4E0B\u65B9\uFF09' },
      { name: "objective", type: "string", required: true, doc: "Objective name to display", docZh: "\u8981\u663E\u793A\u7684\u8BA1\u5206\u677F\u76EE\u6807\u540D\u79F0" }
    ],
    returns: "void",
    doc: "Displays a scoreboard objective in a display slot.",
    docZh: "\u5728\u6307\u5B9A\u663E\u793A\u4F4D\u7F6E\u5C55\u793A\u8BA1\u5206\u677F\u76EE\u6807\u3002",
    examples: ['scoreboard_display("sidebar", "kills");'],
    compilesTo: "scoreboard objectives setdisplay <slot> <objective>",
    category: "scoreboard"
  },
  scoreboard_hide: {
    name: "scoreboard_hide",
    params: [
      { name: "slot", type: "string", required: true, doc: '"list", "sidebar", or "belowName"', docZh: '"list"\u3001"sidebar" \u6216 "belowName"' }
    ],
    returns: "void",
    doc: "Clears the display in a scoreboard slot.",
    docZh: "\u6E05\u9664\u8BA1\u5206\u677F\u663E\u793A\u4F4D\u7F6E\u7684\u5185\u5BB9\u3002",
    examples: ['scoreboard_hide("sidebar");'],
    compilesTo: "scoreboard objectives setdisplay <slot>",
    category: "scoreboard"
  },
  scoreboard_add_objective: {
    name: "scoreboard_add_objective",
    params: [
      { name: "name", type: "string", required: true, doc: "Objective name", docZh: "\u76EE\u6807\u540D\u79F0" },
      { name: "criteria", type: "string", required: true, doc: 'Criteria (e.g. "dummy", "playerKillCount")', docZh: '\u6807\u51C6\u7C7B\u578B\uFF08\u5982 "dummy"\u3001"playerKillCount"\uFF09' },
      { name: "displayName", type: "string", required: false, doc: "Optional display name", docZh: "\u53EF\u9009\u7684\u663E\u793A\u540D\u79F0" }
    ],
    returns: "void",
    doc: "Creates a new scoreboard objective.",
    docZh: "\u521B\u5EFA\u65B0\u7684\u8BA1\u5206\u677F\u76EE\u6807\u3002",
    examples: ['scoreboard_add_objective("kills", "playerKillCount");', 'scoreboard_add_objective("timer", "dummy", "Game Timer");'],
    compilesTo: "scoreboard objectives add <name> <criteria> [displayName]",
    category: "scoreboard"
  },
  scoreboard_remove_objective: {
    name: "scoreboard_remove_objective",
    params: [
      { name: "name", type: "string", required: true, doc: "Objective name to remove", docZh: "\u8981\u5220\u9664\u7684\u76EE\u6807\u540D\u79F0" }
    ],
    returns: "void",
    doc: "Removes a scoreboard objective.",
    docZh: "\u5220\u9664\u8BA1\u5206\u677F\u76EE\u6807\u3002",
    examples: ['scoreboard_remove_objective("kills");'],
    compilesTo: "scoreboard objectives remove <name>",
    category: "scoreboard"
  },
  // -------------------------------------------------------------------------
  // Random
  // -------------------------------------------------------------------------
  random: {
    name: "random",
    params: [
      { name: "min", type: "int", required: true, doc: "Minimum value (inclusive)", docZh: "\u6700\u5C0F\u503C\uFF08\u5305\u542B\uFF09" },
      { name: "max", type: "int", required: true, doc: "Maximum value (inclusive)", docZh: "\u6700\u5927\u503C\uFF08\u5305\u542B\uFF09" }
    ],
    returns: "int",
    doc: "Generates a random integer in range [min, max] using scoreboard arithmetic. Compatible with all MC versions.",
    docZh: "\u4F7F\u7528\u8BA1\u5206\u677F\u8FD0\u7B97\u751F\u6210 [min, max] \u8303\u56F4\u5185\u7684\u968F\u673A\u6574\u6570\uFF0C\u517C\u5BB9\u6240\u6709 MC \u7248\u672C\u3002",
    examples: ["let roll: int = random(1, 6);", "let chance: int = random(0, 99);"],
    compilesTo: "scoreboard players random <dst> rs <min> <max>",
    category: "random"
  },
  random_native: {
    name: "random_native",
    params: [
      { name: "min", type: "int", required: true, doc: "Minimum value (inclusive)", docZh: "\u6700\u5C0F\u503C\uFF08\u5305\u542B\uFF09" },
      { name: "max", type: "int", required: true, doc: "Maximum value (inclusive)", docZh: "\u6700\u5927\u503C\uFF08\u5305\u542B\uFF09" }
    ],
    returns: "int",
    doc: "Generates a random integer using /random command (MC 1.20.3+). Faster and more reliable than random().",
    docZh: "\u4F7F\u7528 /random \u547D\u4EE4\uFF08MC 1.20.3+\uFF09\u751F\u6210\u968F\u673A\u6574\u6570\uFF0C\u6BD4 random() \u66F4\u5FEB\u66F4\u53EF\u9760\u3002",
    examples: ["let n: int = random_native(1, 100);"],
    compilesTo: "execute store result score <dst> rs run random value <min> <max>",
    category: "random"
  },
  random_sequence: {
    name: "random_sequence",
    params: [
      { name: "sequence", type: "string", required: true, doc: 'Sequence name (namespaced, e.g. "mypack:loot")', docZh: '\u5E8F\u5217\u540D\u79F0\uFF08\u5E26\u547D\u540D\u7A7A\u95F4\uFF0C\u5982 "mypack:loot"\uFF09' },
      { name: "seed", type: "int", required: false, default: "0", doc: "Seed value", docZh: "\u79CD\u5B50\u503C" }
    ],
    returns: "void",
    doc: "Resets a random sequence with an optional seed (MC 1.20.3+).",
    docZh: "\u91CD\u7F6E\u968F\u673A\u5E8F\u5217\uFF0C\u53EF\u6307\u5B9A\u79CD\u5B50\uFF08MC 1.20.3+\uFF09\u3002",
    examples: ['random_sequence("mypack:loot", 42);'],
    compilesTo: "random reset <sequence> <seed>",
    category: "random"
  },
  // -------------------------------------------------------------------------
  // Data (NBT)
  // -------------------------------------------------------------------------
  data_get: {
    name: "data_get",
    params: [
      { name: "targetType", type: "string", required: true, doc: '"entity", "block", or "storage"', docZh: '"entity"\uFF08\u5B9E\u4F53\uFF09\u3001"block"\uFF08\u65B9\u5757\uFF09\u6216 "storage"\uFF08\u5B58\u50A8\uFF09' },
      { name: "target", type: "string", required: true, doc: "Target selector or storage path", docZh: "\u76EE\u6807\u9009\u62E9\u5668\u6216\u5B58\u50A8\u8DEF\u5F84" },
      { name: "path", type: "string", required: true, doc: 'NBT path (e.g. "Health")', docZh: 'NBT \u8DEF\u5F84\uFF08\u5982 "Health"\uFF09' },
      { name: "scale", type: "float", required: false, default: "1", doc: "Scale factor", docZh: "\u7F29\u653E\u56E0\u5B50" }
    ],
    returns: "int",
    doc: "Reads NBT data from an entity, block, or storage into an integer variable.",
    docZh: "\u4ECE\u5B9E\u4F53\u3001\u65B9\u5757\u6216\u5B58\u50A8\u8BFB\u53D6 NBT \u6570\u636E\u5230\u6574\u578B\u53D8\u91CF\u3002",
    examples: [
      'let hp: int = data_get("entity", "@s", "Health");',
      'let val: int = data_get("storage", "mypack:data", "myKey");'
    ],
    compilesTo: "execute store result score <dst> rs run data get <targetType> <target> <path> [scale]",
    category: "data"
  },
  data_merge: {
    name: "data_merge",
    params: [
      { name: "target", type: "selector", required: true, doc: "Target entity selector or block position", docZh: "\u76EE\u6807\u5B9E\u4F53\u9009\u62E9\u5668\u6216\u65B9\u5757\u5750\u6807" },
      { name: "nbt", type: "nbt", required: true, doc: "NBT data to merge (struct literal or string)", docZh: "\u8981\u5408\u5E76\u7684 NBT \u6570\u636E\uFF08\u7ED3\u6784\u4F53\u5B57\u9762\u91CF\u6216\u5B57\u7B26\u4E32\uFF09" }
    ],
    returns: "void",
    doc: "Merges NBT data into an entity, block, or storage.",
    docZh: "\u5C06 NBT \u6570\u636E\u5408\u5E76\u5230\u5B9E\u4F53\u3001\u65B9\u5757\u6216\u5B58\u50A8\u4E2D\u3002",
    examples: ["data_merge(@s, { Invisible: 1b, Silent: 1b });"],
    compilesTo: "data merge entity/block/storage <target> <nbt>",
    category: "data"
  },
  // -------------------------------------------------------------------------
  // Bossbar
  // -------------------------------------------------------------------------
  bossbar_add: {
    name: "bossbar_add",
    params: [
      { name: "id", type: "string", required: true, doc: 'Boss bar ID (namespaced, e.g. "minecraft:health")', docZh: '\u8840\u6761 ID\uFF08\u5E26\u547D\u540D\u7A7A\u95F4\uFF0C\u5982 "minecraft:health"\uFF09' },
      { name: "name", type: "string", required: true, doc: "Display name", docZh: "\u663E\u793A\u540D\u79F0" }
    ],
    returns: "void",
    doc: "Creates a new boss bar.",
    docZh: "\u521B\u5EFA\u65B0\u7684 Boss \u8840\u6761\u3002",
    examples: ['bossbar_add("mymod:timer", "Time Left");'],
    compilesTo: 'bossbar add <id> {"text":"<name>"}',
    category: "bossbar"
  },
  bossbar_set_value: {
    name: "bossbar_set_value",
    params: [
      { name: "id", type: "string", required: true, doc: "Boss bar ID", docZh: "\u8840\u6761 ID" },
      { name: "value", type: "int", required: true, doc: "Current value", docZh: "\u5F53\u524D\u503C" }
    ],
    returns: "void",
    doc: "Sets the current value of a boss bar.",
    docZh: "\u8BBE\u7F6E Boss \u8840\u6761\u7684\u5F53\u524D\u503C\u3002",
    examples: ['bossbar_set_value("mymod:timer", 60);'],
    compilesTo: "bossbar set <id> value <value>",
    category: "bossbar"
  },
  bossbar_set_max: {
    name: "bossbar_set_max",
    params: [
      { name: "id", type: "string", required: true, doc: "Boss bar ID", docZh: "\u8840\u6761 ID" },
      { name: "max", type: "int", required: true, doc: "Maximum value", docZh: "\u6700\u5927\u503C" }
    ],
    returns: "void",
    doc: "Sets the maximum value of a boss bar.",
    docZh: "\u8BBE\u7F6E Boss \u8840\u6761\u7684\u6700\u5927\u503C\u3002",
    examples: ['bossbar_set_max("mymod:timer", 300);'],
    compilesTo: "bossbar set <id> max <max>",
    category: "bossbar"
  },
  bossbar_set_color: {
    name: "bossbar_set_color",
    params: [
      { name: "id", type: "string", required: true, doc: "Boss bar ID", docZh: "\u8840\u6761 ID" },
      { name: "color", type: "string", required: true, doc: '"blue", "green", "pink", "purple", "red", "white", or "yellow"', docZh: '"blue"/"green"/"pink"/"purple"/"red"/"white"/"yellow"' }
    ],
    returns: "void",
    doc: "Sets the color of a boss bar.",
    docZh: "\u8BBE\u7F6E Boss \u8840\u6761\u7684\u989C\u8272\u3002",
    examples: ['bossbar_set_color("mymod:timer", "red");'],
    compilesTo: "bossbar set <id> color <color>",
    category: "bossbar"
  },
  bossbar_set_style: {
    name: "bossbar_set_style",
    params: [
      { name: "id", type: "string", required: true, doc: "Boss bar segmentation style", docZh: "\u8840\u6761\u5206\u6BB5\u6837\u5F0F" },
      { name: "style", type: "string", required: true, doc: '"notched_6", "notched_10", "notched_12", "notched_20", or "progress"', docZh: '"notched_6"/"notched_10"/"notched_12"/"notched_20"/"progress"' }
    ],
    returns: "void",
    doc: "Sets the style (segmentation) of a boss bar.",
    docZh: "\u8BBE\u7F6E Boss \u8840\u6761\u7684\u6837\u5F0F\uFF08\u5206\u6BB5\u65B9\u5F0F\uFF09\u3002",
    examples: ['bossbar_set_style("mymod:timer", "notched_10");'],
    compilesTo: "bossbar set <id> style <style>",
    category: "bossbar"
  },
  bossbar_set_visible: {
    name: "bossbar_set_visible",
    params: [
      { name: "id", type: "string", required: true, doc: "Boss bar ID", docZh: "\u8840\u6761 ID" },
      { name: "visible", type: "bool", required: true, doc: "Visibility state (true = show, false = hide)", docZh: "\u53EF\u89C1\u72B6\u6001\uFF08true = \u663E\u793A\uFF0Cfalse = \u9690\u85CF\uFF09" }
    ],
    returns: "void",
    doc: "Shows or hides a boss bar.",
    docZh: "\u663E\u793A\u6216\u9690\u85CF Boss \u8840\u6761\u3002",
    examples: ['bossbar_set_visible("mymod:timer", true);'],
    compilesTo: "bossbar set <id> visible <visible>",
    category: "bossbar"
  },
  bossbar_set_players: {
    name: "bossbar_set_players",
    params: [
      { name: "id", type: "string", required: true, doc: "Boss bar ID", docZh: "\u8840\u6761 ID" },
      { name: "target", type: "selector", required: true, doc: "Players who should see the boss bar", docZh: "\u80FD\u770B\u5230\u8840\u6761\u7684\u73A9\u5BB6" }
    ],
    returns: "void",
    doc: "Sets which players can see the boss bar.",
    docZh: "\u8BBE\u7F6E\u54EA\u4E9B\u73A9\u5BB6\u80FD\u770B\u5230 Boss \u8840\u6761\u3002",
    examples: ['bossbar_set_players("mymod:timer", @a);'],
    compilesTo: "bossbar set <id> players <target>",
    category: "bossbar"
  },
  bossbar_remove: {
    name: "bossbar_remove",
    params: [
      { name: "id", type: "string", required: true, doc: "Boss bar ID to remove", docZh: "\u8981\u79FB\u9664\u7684\u8840\u6761 ID" }
    ],
    returns: "void",
    doc: "Removes a boss bar.",
    docZh: "\u79FB\u9664 Boss \u8840\u6761\u3002",
    examples: ['bossbar_remove("mymod:timer");'],
    compilesTo: "bossbar remove <id>",
    category: "bossbar"
  },
  bossbar_get_value: {
    name: "bossbar_get_value",
    params: [
      { name: "id", type: "string", required: true, doc: "Boss bar ID", docZh: "\u8840\u6761 ID" }
    ],
    returns: "int",
    doc: "Gets the current value of a boss bar.",
    docZh: "\u83B7\u53D6 Boss \u8840\u6761\u7684\u5F53\u524D\u503C\u3002",
    examples: ['let v: int = bossbar_get_value("mymod:timer");'],
    compilesTo: "execute store result score <dst> rs run bossbar get <id> value",
    category: "bossbar"
  },
  // -------------------------------------------------------------------------
  // Teams
  // -------------------------------------------------------------------------
  team_add: {
    name: "team_add",
    params: [
      { name: "name", type: "string", required: true, doc: "Team name", docZh: "\u961F\u4F0D\u540D\u79F0" },
      { name: "displayName", type: "string", required: false, doc: "Optional display name", docZh: "\u53EF\u9009\u7684\u663E\u793A\u540D\u79F0" }
    ],
    returns: "void",
    doc: "Creates a new team.",
    docZh: "\u521B\u5EFA\u65B0\u7684\u961F\u4F0D\u3002",
    examples: ['team_add("red");', 'team_add("blue", "Blue Team");'],
    compilesTo: "team add <name> [displayName]",
    category: "teams"
  },
  team_remove: {
    name: "team_remove",
    params: [
      { name: "name", type: "string", required: true, doc: "Team name to remove", docZh: "\u8981\u79FB\u9664\u7684\u961F\u4F0D\u540D\u79F0" }
    ],
    returns: "void",
    doc: "Removes a team.",
    docZh: "\u79FB\u9664\u961F\u4F0D\u3002",
    examples: ['team_remove("red");'],
    compilesTo: "team remove <name>",
    category: "teams"
  },
  team_join: {
    name: "team_join",
    params: [
      { name: "name", type: "string", required: true, doc: "Team name to join", docZh: "\u8981\u52A0\u5165\u7684\u961F\u4F0D\u540D\u79F0" },
      { name: "target", type: "selector", required: true, doc: "Entities to add to the team", docZh: "\u8981\u52A0\u5165\u961F\u4F0D\u7684\u5B9E\u4F53" }
    ],
    returns: "void",
    doc: "Adds entities to a team.",
    docZh: "\u5C06\u5B9E\u4F53\u52A0\u5165\u961F\u4F0D\u3002",
    examples: ['team_join("red", @s);', 'team_join("blue", @a[tag=blue_team]);'],
    compilesTo: "team join <name> <target>",
    category: "teams"
  },
  team_leave: {
    name: "team_leave",
    params: [
      { name: "target", type: "selector", required: true, doc: "Entities to remove from their team", docZh: "\u8981\u79BB\u5F00\u961F\u4F0D\u7684\u5B9E\u4F53" }
    ],
    returns: "void",
    doc: "Removes entities from their current team.",
    docZh: "\u5C06\u5B9E\u4F53\u4ECE\u5F53\u524D\u961F\u4F0D\u4E2D\u79FB\u9664\u3002",
    examples: ["team_leave(@s);"],
    compilesTo: "team leave <target>",
    category: "teams"
  },
  team_option: {
    name: "team_option",
    params: [
      { name: "name", type: "string", required: true, doc: "Team name", docZh: "\u961F\u4F0D\u540D\u79F0" },
      { name: "option", type: "string", required: true, doc: 'Option name (e.g. "color", "friendlyFire", "prefix")', docZh: '\u9009\u9879\u540D\uFF08\u5982 "color"\u3001"friendlyFire"\u3001"prefix"\uFF09' },
      { name: "value", type: "string", required: true, doc: "Option value", docZh: "\u9009\u9879\u503C" }
    ],
    returns: "void",
    doc: "Sets a team option/property.",
    docZh: "\u8BBE\u7F6E\u961F\u4F0D\u9009\u9879/\u5C5E\u6027\u3002",
    examples: ['team_option("red", "color", "red");', 'team_option("blue", "friendlyFire", "false");'],
    compilesTo: "team modify <name> <option> <value>",
    category: "teams"
  },
  // -------------------------------------------------------------------------
  // Sets (NBT-backed unique collections)
  // -------------------------------------------------------------------------
  set_new: {
    name: "set_new",
    params: [],
    returns: "string",
    doc: "Creates a new unique set backed by NBT storage. Returns the set ID.",
    docZh: "\u521B\u5EFA\u65B0\u7684\u57FA\u4E8E NBT \u5B58\u50A8\u7684\u552F\u4E00\u96C6\u5408\uFF0C\u8FD4\u56DE\u96C6\u5408 ID\u3002",
    examples: ["let enemies: string = set_new();", 'set_add(enemies, "@s");'],
    compilesTo: "data modify storage rs:sets <setId> set value []",
    category: "collections"
  },
  set_add: {
    name: "set_add",
    params: [
      { name: "setId", type: "string", required: true, doc: "Set ID returned by set_new()", docZh: "set_new() \u8FD4\u56DE\u7684\u96C6\u5408 ID" },
      { name: "value", type: "string", required: true, doc: "Value to add", docZh: "\u8981\u6DFB\u52A0\u7684\u503C" }
    ],
    returns: "void",
    doc: "Adds a value to a set (no-op if already present).",
    docZh: "\u5411\u96C6\u5408\u6DFB\u52A0\u503C\uFF08\u82E5\u5DF2\u5B58\u5728\u5219\u4E0D\u64CD\u4F5C\uFF09\u3002",
    examples: ['set_add(enemies, "@s");'],
    compilesTo: "execute unless data storage rs:sets <setId>[{value:<v>}] run data modify ...",
    category: "collections"
  },
  set_contains: {
    name: "set_contains",
    params: [
      { name: "setId", type: "string", required: true, doc: "Set ID", docZh: "\u96C6\u5408 ID" },
      { name: "value", type: "string", required: true, doc: "Value to check", docZh: "\u8981\u68C0\u67E5\u7684\u503C" }
    ],
    returns: "int",
    doc: "Returns 1 if the set contains the value, 0 otherwise.",
    docZh: "\u82E5\u96C6\u5408\u5305\u542B\u8BE5\u503C\u8FD4\u56DE 1\uFF0C\u5426\u5219\u8FD4\u56DE 0\u3002",
    examples: ['if set_contains(enemies, "@s") { kill(@s); }'],
    compilesTo: "execute store result score <dst> rs if data storage rs:sets <setId>[{value:<v>}]",
    category: "collections"
  },
  set_remove: {
    name: "set_remove",
    params: [
      { name: "setId", type: "string", required: true, doc: "Set ID", docZh: "\u96C6\u5408 ID" },
      { name: "value", type: "string", required: true, doc: "Value to remove", docZh: "\u8981\u79FB\u9664\u7684\u503C" }
    ],
    returns: "void",
    doc: "Removes a value from a set.",
    docZh: "\u4ECE\u96C6\u5408\u4E2D\u79FB\u9664\u4E00\u4E2A\u503C\u3002",
    examples: ['set_remove(enemies, "@s");'],
    compilesTo: "data remove storage rs:sets <setId>[{value:<v>}]",
    category: "collections"
  },
  set_clear: {
    name: "set_clear",
    params: [
      { name: "setId", type: "string", required: true, doc: "Set ID to clear", docZh: "\u8981\u6E05\u7A7A\u7684\u96C6\u5408 ID" }
    ],
    returns: "void",
    doc: "Removes all values from a set.",
    docZh: "\u6E05\u7A7A\u96C6\u5408\u4E2D\u7684\u6240\u6709\u503C\u3002",
    examples: ["set_clear(enemies);"],
    compilesTo: "data modify storage rs:sets <setId> set value []",
    category: "collections"
  },
  // -------------------------------------------------------------------------
  // Timers
  // -------------------------------------------------------------------------
  setTimeout: {
    name: "setTimeout",
    params: [
      { name: "delay", type: "int", required: true, doc: "Delay in ticks before executing the callback", docZh: "\u6267\u884C\u56DE\u8C03\u524D\u7684\u5EF6\u8FDF\uFF08tick\uFF09" },
      { name: "callback", type: "string", required: true, doc: "Lambda function to execute after delay", docZh: "\u5EF6\u8FDF\u540E\u6267\u884C\u7684 lambda \u51FD\u6570" }
    ],
    returns: "void",
    doc: "Executes a callback function after a delay (in ticks).",
    docZh: "\u5728\u6307\u5B9A\u5EF6\u8FDF\uFF08tick\uFF09\u540E\u6267\u884C\u56DE\u8C03\u51FD\u6570\u3002",
    examples: ['setTimeout(100, () => { say("5 seconds passed!"); });'],
    compilesTo: "schedule function <ns>:<callback> <delay>t",
    category: "timers"
  },
  setInterval: {
    name: "setInterval",
    params: [
      { name: "interval", type: "int", required: true, doc: "Interval in ticks between executions", docZh: "\u6BCF\u6B21\u6267\u884C\u4E4B\u95F4\u7684\u95F4\u9694\uFF08tick\uFF09" },
      { name: "callback", type: "string", required: true, doc: "Lambda function to execute repeatedly", docZh: "\u91CD\u590D\u6267\u884C\u7684 lambda \u51FD\u6570" }
    ],
    returns: "int",
    doc: "Executes a callback function repeatedly at a fixed interval. Returns an interval ID.",
    docZh: "\u4EE5\u56FA\u5B9A\u95F4\u9694\u91CD\u590D\u6267\u884C\u56DE\u8C03\u51FD\u6570\uFF0C\u8FD4\u56DE\u95F4\u9694 ID\u3002",
    examples: ['let timer: int = setInterval(20, () => { say("Every second!"); });'],
    compilesTo: "schedule function <ns>:<callback> <interval>t",
    category: "timers"
  },
  clearInterval: {
    name: "clearInterval",
    params: [
      { name: "id", type: "int", required: true, doc: "Interval ID returned by setInterval()", docZh: "setInterval() \u8FD4\u56DE\u7684\u95F4\u9694 ID" }
    ],
    returns: "void",
    doc: "Cancels a repeating interval created by setInterval().",
    docZh: "\u53D6\u6D88\u7531 setInterval() \u521B\u5EFA\u7684\u91CD\u590D\u95F4\u9694\u3002",
    examples: ["clearInterval(timer);"],
    compilesTo: "schedule clear <ns>:<intervalFn>",
    category: "timers"
  }
};

// ../../src/lsp/server.ts
var connection = (0, import_node.createConnection)(import_node.ProposedFeatures.all);
var documents = new import_node.TextDocuments(TextDocument);
function loadBuiltinsFromDeclFile() {
  const extra = {};
  const candidates = [
    path.resolve(__dirname, "../../builtins.d.mcrs"),
    path.resolve(__dirname, "../../../builtins.d.mcrs"),
    path.resolve(__dirname, "../../../../builtins.d.mcrs")
  ];
  let src = "";
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      src = fs.readFileSync(p, "utf-8");
      break;
    }
  }
  if (!src) return extra;
  const lines = src.split("\n");
  let docLines = [];
  let paramDocs = {};
  for (const line of lines) {
    const tripleDoc = line.match(/^\/\/\/\s?(.*)$/);
    if (tripleDoc) {
      const content = tripleDoc[1];
      const paramMatch = content.match(/^@param\s+(\w+)\s+(.+)$/);
      if (paramMatch) {
        paramDocs[paramMatch[1]] = paramMatch[2];
      } else if (!content.startsWith("@example")) {
        docLines.push(content);
      }
      continue;
    }
    const declMatch = line.match(/^declare fn (\w+)\(([^)]*)\):\s*(\w+);?$/);
    if (declMatch) {
      const [, fnName, paramsStr, retType] = declMatch;
      if (!ALL_BUILTINS[fnName]) {
        const params = paramsStr.trim() ? paramsStr.split(",").map((p) => {
          const [pname, ptype] = p.trim().split(":").map((s) => s.trim());
          return {
            name: pname ?? "",
            type: ptype ?? "string",
            required: true,
            doc: paramDocs[pname ?? ""] ?? "",
            docZh: ""
          };
        }) : [];
        extra[fnName] = {
          name: fnName,
          params,
          returns: retType === "void" || retType === "int" || retType === "bool" || retType === "string" ? retType : "void",
          doc: docLines.join(" ").trim(),
          docZh: "",
          examples: [],
          category: "builtin"
        };
      }
      docLines = [];
      paramDocs = {};
      continue;
    }
    if (line.trim() && !line.startsWith("//")) {
      docLines = [];
      paramDocs = {};
    }
  }
  return extra;
}
var EXTRA_BUILTINS = loadBuiltinsFromDeclFile();
var ALL_BUILTINS = { ...EXTRA_BUILTINS, ...BUILTIN_METADATA };
var parsedDocs = /* @__PURE__ */ new Map();
function typeToString(t) {
  switch (t.kind) {
    case "named":
      return t.name;
    case "array":
      return `${typeToString(t.elem)}[]`;
    case "struct":
      return t.name;
    case "enum":
      return t.name;
    case "entity":
      return t.entityType;
    case "selector":
      return t.entityType ? `selector<${t.entityType}>` : "selector";
    case "tuple":
      return `(${t.elements.map(typeToString).join(", ")})`;
    case "function_type":
      return `(${t.params.map(typeToString).join(", ")}) => ${typeToString(t.return)}`;
    default:
      return "unknown";
  }
}
function parseDocument(uri, source) {
  const errors = [];
  let program = null;
  try {
    const strippedSource = source.replace(/^import\s+"[^"]*"\s*;?\s*$/gm, "// (import stripped for LSP)");
    const lexer = new Lexer(strippedSource);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, strippedSource, uri);
    program = parser.parse("redscript");
    try {
      const checker = new TypeChecker(source, uri);
      const typeErrors = checker.check(program);
      errors.push(...typeErrors);
    } catch {
    }
  } catch (err) {
    if (err instanceof DiagnosticError) {
      errors.push(err);
    } else if (err instanceof Error) {
      errors.push(new DiagnosticError(
        "ParseError",
        err.message,
        { line: 1, col: 1, file: uri }
      ));
    }
  }
  const doc = { program, errors, source };
  parsedDocs.set(uri, doc);
  return doc;
}
function toDiagnostic(err) {
  const line = Math.max(0, (err.location?.line ?? 1) - 1);
  const col = Math.max(0, (err.location?.col ?? 1) - 1);
  return {
    severity: import_node.DiagnosticSeverity.Error,
    range: {
      start: { line, character: col },
      end: { line, character: col + 80 }
    },
    message: err.message,
    source: "redscript"
  };
}
var DECORATOR_DOCS = {
  tick: "Runs every game tick.\n\n**Optional args:** `rate=N` (every N ticks, e.g. `@tick(rate=20)` = once per second)\n\nExample: `@tick fn every_tick() {}` or `@tick(rate=20) fn every_second() {}`",
  load: "Runs once on `/reload`. Use for initialization.\n\nExample: `@load fn init() { scoreboard_create(...) }`",
  coroutine: "Wraps a loop to spread execution across multiple ticks.\n\n**Required arg:** `batch=N` \u2014 iterations per tick.\n\nExample: `@coroutine(batch=10) fn scan_blocks() { for i in 0..1000 { ... } }`",
  schedule: "Schedules the function to run after a delay.\n\n**Required arg:** `ticks=N`\n\nExample: `@schedule(ticks=100) fn delayed() {}`",
  on_trigger: 'Runs when a player executes `/trigger <name>`.\n\n**Required arg:** trigger objective name.\n\nExample: `@on_trigger("shop") fn open_shop() {}`',
  keep: "Prevents dead-code elimination. Use for exported entry points not referenced in the same file.\n\nExample: `@keep fn public_api() {}`",
  on: 'Generic event handler. Arg: event name.\n\nExample: `@on("custom:event") fn handler() {}`',
  on_advancement: 'Runs when a player earns an advancement.\n\n**Arg:** advancement id (e.g. `"story/mine_diamond"`).\n\nExample: `@on_advancement("story/mine_diamond") fn reward() {}`',
  on_craft: 'Runs when a player crafts an item.\n\n**Arg:** item id (e.g. `"minecraft:diamond_sword"`).\n\nExample: `@on_craft("minecraft:diamond_sword") fn on_craft_sword() {}`',
  on_death: "Runs when a player dies.\n\nExample: `@on_death fn on_player_death() {}`",
  on_join_team: 'Runs when a player joins a team.\n\n**Arg:** team name.\n\nExample: `@on_join_team("red") fn joined_red() {}`',
  on_login: 'Runs when a player logs into the server.\n\nExample: `@on_login fn welcome() { tell(@s, f"Welcome back!") }`'
};
function wordAt(source, position) {
  const lines = source.split("\n");
  const line = lines[position.line] ?? "";
  const ch = position.character;
  let start = ch;
  while (start > 0 && /\w/.test(line[start - 1])) start--;
  let end = ch;
  while (end < line.length && /\w/.test(line[end])) end++;
  return line.slice(start, end);
}
function findFunction(program, name) {
  const fn = program.declarations.find((f) => f.name === name);
  if (fn) return fn;
  for (const impl of program.implBlocks ?? []) {
    const m = impl.methods.find((f) => f.name === name);
    if (m) return m;
  }
  return void 0;
}
function formatFnSignature(fn) {
  const params = fn.params.map((p) => `${p.name}: ${typeToString(p.type)}`).join(", ");
  const ret = typeToString(fn.returnType);
  const typeParams = fn.typeParams?.length ? `<${fn.typeParams.join(", ")}>` : "";
  return `fn ${fn.name}${typeParams}(${params}): ${ret}`;
}
function extractDocComment(source, fn) {
  if (!fn.span) return null;
  const lines = source.split("\n");
  let endLine = fn.span.line - 2;
  if (endLine < 0) return null;
  while (endLine >= 0 && lines[endLine].trim() === "") endLine--;
  if (endLine < 0) return null;
  if (lines[endLine].trim().endsWith("*/")) {
    let startLine = endLine;
    while (startLine >= 0 && !lines[startLine].trim().startsWith("/**")) startLine--;
    if (startLine < 0) return null;
    const commentLines = lines.slice(startLine, endLine + 1);
    return commentLines.map((l) => l.replace(/^\s*\/\*\*\s?/, "").replace(/^\s*\*\/\s?$/, "").replace(/^\s*\*\s?/, "").trimEnd()).filter((l) => l.length > 0).join("\n") || null;
  }
  if (lines[endLine].trim().startsWith("//")) {
    let startLine = endLine;
    while (startLine > 0 && lines[startLine - 1].trim().startsWith("//")) startLine--;
    return lines.slice(startLine, endLine + 1).map((l) => l.replace(/^\s*\/\/\/?\/?\s?/, "").trimEnd()).filter((l) => l.length > 0).join("\n") || null;
  }
  return null;
}
function findEnclosingFn(program, curLine) {
  const fns = program.declarations.filter((f) => f.span);
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i];
    const startLine = fn.span.line;
    const endLine = fn.span.endLine ?? (fns[i + 1]?.span?.line ? fns[i + 1].span.line - 1 : Infinity);
    if (curLine >= startLine && curLine <= endLine) return fn;
  }
  return null;
}
function buildDefinitionMap(program, source) {
  const map = /* @__PURE__ */ new Map();
  for (const fn of program.declarations) {
    if (fn.span) map.set(fn.name, fn.span);
  }
  for (const impl of program.implBlocks ?? []) {
    for (const m of impl.methods) {
      if (m.span) map.set(`${impl.typeName}.${m.name}`, m.span);
    }
  }
  for (const s of program.structs ?? []) {
    if (s.span) map.set(s.name, s.span);
  }
  for (const e of program.enums ?? []) {
    if (e.span) map.set(e.name, e.span);
  }
  for (const c of program.consts ?? []) {
    if (c.span) map.set(c.name, c.span);
  }
  for (const g of program.globals ?? []) {
    if (g.span) map.set(g.name, g.span);
  }
  return map;
}
var KEYWORD_COMPLETIONS = [
  "fn",
  "let",
  "if",
  "else",
  "while",
  "for",
  "foreach",
  "return",
  "break",
  "continue",
  "as",
  "at",
  "match",
  "struct",
  "enum",
  "impl",
  "const",
  "global",
  "true",
  "false",
  "module",
  "import"
].map((kw) => ({
  label: kw,
  kind: import_node.CompletionItemKind.Keyword
}));
var TYPE_COMPLETIONS = [
  "int",
  "bool",
  "fixed",
  "float",
  "string",
  "void",
  "BlockPos",
  "byte",
  "short",
  "long",
  "double",
  "entity",
  "Player",
  "Mob",
  "HostileMob",
  "PassiveMob",
  "Zombie",
  "Skeleton",
  "Creeper",
  "Spider",
  "Enderman"
].map((t) => ({
  label: t,
  kind: import_node.CompletionItemKind.TypeParameter
}));
var DECORATOR_COMPLETIONS = [
  { label: "@tick", detail: "Run every game tick (~20 Hz)", insertText: "tick" },
  { label: "@load", detail: "Run on /reload (initialization)", insertText: "load" },
  { label: "@on_trigger", detail: "Run when a player uses /trigger", insertText: "on_trigger" },
  { label: "@schedule", detail: "Schedule function after N ticks", insertText: "schedule" },
  { label: "@coroutine", detail: "Spread loop across ticks (batch=N)", insertText: "coroutine" },
  { label: "@keep", detail: "Prevent dead-code elimination", insertText: "keep" },
  { label: "@on", detail: "Generic event handler", insertText: "on" },
  { label: "@on_advancement", detail: "Run on advancement earned", insertText: "on_advancement" },
  { label: "@on_craft", detail: "Run on item craft", insertText: "on_craft" },
  { label: "@on_death", detail: "Run on player death", insertText: "on_death" },
  { label: "@on_join_team", detail: "Run on team join", insertText: "on_join_team" },
  { label: "@on_login", detail: "Run on player login", insertText: "on_login" },
  { label: "@require_on_load", detail: "Ensure a fn runs on load (stdlib)", insertText: "require_on_load" }
].map((d) => ({ ...d, kind: import_node.CompletionItemKind.Event }));
var SELECTOR_COMPLETIONS = [
  { label: "@a", insertText: "a", kind: import_node.CompletionItemKind.Value, detail: "All players", documentation: "Targets all online players." },
  { label: "@p", insertText: "p", kind: import_node.CompletionItemKind.Value, detail: "Nearest player", documentation: "Targets the nearest player to the command source." },
  { label: "@s", insertText: "s", kind: import_node.CompletionItemKind.Value, detail: "Executing entity", documentation: "Targets the entity currently executing the command." },
  { label: "@e", insertText: "e", kind: import_node.CompletionItemKind.Value, detail: "All entities", documentation: "Targets all entities (use [type=...] to filter)." },
  { label: "@r", insertText: "r", kind: import_node.CompletionItemKind.Value, detail: "Random player", documentation: "Targets a random online player." },
  { label: "@n", insertText: "n", kind: import_node.CompletionItemKind.Value, detail: "Nearest entity", documentation: "Targets the nearest entity (any type)." }
];
var BUILTIN_FN_COMPLETIONS = [
  "say",
  "tell",
  "give",
  "kill",
  "teleport",
  "summon",
  "setblock",
  "fill",
  "clone",
  "effect",
  "enchant",
  "experience",
  "gamemode",
  "gamerule",
  "particle",
  "playsound",
  "stopsound",
  "scoreboard",
  "tag",
  "title",
  "subtitle",
  "actionbar",
  "tellraw",
  "announce",
  "setTimeout",
  "setInterval",
  "clearInterval"
].map((fn) => ({
  label: fn,
  kind: import_node.CompletionItemKind.Function
}));
connection.onInitialize((_params) => {
  return {
    capabilities: {
      textDocumentSync: import_node.TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      definitionProvider: true,
      completionProvider: {
        triggerCharacters: [".", "@"],
        resolveProvider: false
      },
      signatureHelpProvider: {
        triggerCharacters: ["(", ","]
      },
      referencesProvider: true,
      renameProvider: true,
      inlayHintProvider: true
    },
    serverInfo: {
      name: "redscript-lsp",
      version: "1.0.0"
    }
  };
});
connection.onInitialized(() => {
  connection.console.log("RedScript LSP server ready");
});
function validateAndPublish(doc) {
  const source = doc.getText();
  const parsed = parseDocument(doc.uri, source);
  const diagnostics = parsed.errors.map(toDiagnostic);
  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}
documents.onDidOpen((e) => validateAndPublish(e.document));
documents.onDidChangeContent((e) => validateAndPublish(e.document));
documents.onDidClose((e) => {
  parsedDocs.delete(e.document.uri);
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});
connection.onHover((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const source = doc.getText();
  const lines = source.split("\n");
  const lineText = lines[params.position.line] ?? "";
  const ch = params.position.character;
  const decorRe = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let dm;
  while ((dm = decorRe.exec(lineText)) !== null) {
    const atIdx = dm.index;
    const decorEnd = atIdx + dm[0].length;
    if (ch >= atIdx && ch <= decorEnd) {
      const decoratorName = dm[1];
      const decoratorDoc = DECORATOR_DOCS[decoratorName];
      if (decoratorDoc) {
        return {
          contents: {
            kind: import_node.MarkupKind.Markdown,
            value: `**@${decoratorName}** \u2014 ${decoratorDoc}`
          }
        };
      }
    }
  }
  const SELECTOR_DOCS = {
    "@a": "All online players",
    "@p": "Nearest player to the command source",
    "@s": "The entity currently executing the command (self)",
    "@e": "All entities (use [type=...] to filter)",
    "@r": "A random online player",
    "@n": "The nearest entity of any type"
  };
  const selRe = /@([a-zA-Z])/g;
  let sm;
  while ((sm = selRe.exec(lineText)) !== null) {
    const selStart = sm.index;
    const selEnd = selStart + sm[0].length;
    if (ch >= selStart && ch <= selEnd) {
      const selKey = sm[0];
      const selDoc = SELECTOR_DOCS[selKey];
      if (selDoc) {
        return {
          contents: {
            kind: import_node.MarkupKind.Markdown,
            value: `**${selKey}** \u2014 ${selDoc}`
          }
        };
      }
    }
  }
  const cached = parsedDocs.get(params.textDocument.uri);
  const program = cached?.program ?? null;
  if (!program) return null;
  const word = wordAt(source, params.position);
  if (!word) return null;
  const hovLines = source.split("\n");
  const hovLine = hovLines[params.position.line] ?? "";
  const hovCh = params.position.character;
  let hovWordStart = hovCh;
  while (hovWordStart > 0 && /\w/.test(hovLine[hovWordStart - 1])) hovWordStart--;
  if (hovWordStart > 0 && hovLine[hovWordStart - 1] === "@") return null;
  const builtin = ALL_BUILTINS[word];
  if (builtin) {
    const paramStr = builtin.params.map((p) => `${p.name}: ${p.type}${p.required ? "" : "?"}`).join(", ");
    const sig = `fn ${builtin.name}(${paramStr}): ${builtin.returns}`;
    const content = {
      kind: import_node.MarkupKind.Markdown,
      value: `\`\`\`redscript
${sig}
\`\`\`
${builtin.doc}`
    };
    return { contents: content };
  }
  const fn = findFunction(program, word);
  if (fn) {
    const sig = formatFnSignature(fn);
    const content = {
      kind: import_node.MarkupKind.Markdown,
      value: `\`\`\`redscript
${sig}
\`\`\``
    };
    return { contents: content };
  }
  const struct = program.structs?.find((s) => s.name === word);
  if (struct) {
    const fields = struct.fields.map((f) => `  ${f.name}: ${typeToString(f.type)}`).join("\n");
    const content = {
      kind: import_node.MarkupKind.Markdown,
      value: `\`\`\`redscript
struct ${struct.name} {
${fields}
}
\`\`\``
    };
    return { contents: content };
  }
  const enumDecl = program.enums?.find((e) => e.name === word);
  if (enumDecl) {
    const variants = enumDecl.variants.map((v) => `  ${v.name}`).join("\n");
    const content = {
      kind: import_node.MarkupKind.Markdown,
      value: `\`\`\`redscript
enum ${enumDecl.name} {
${variants}
}
\`\`\``
    };
    return { contents: content };
  }
  const constDecl = program.consts?.find((c) => c.name === word);
  if (constDecl) {
    const content = {
      kind: import_node.MarkupKind.Markdown,
      value: `\`\`\`redscript
const ${constDecl.name}: ${typeToString(constDecl.type)}
\`\`\``
    };
    return { contents: content };
  }
  const globalDecl = program.globals?.find((g) => g.name === word);
  if (globalDecl) {
    const content = {
      kind: import_node.MarkupKind.Markdown,
      value: `\`\`\`redscript
let ${globalDecl.name}: ${typeToString(globalDecl.type)}
\`\`\`
*global variable*`
    };
    return { contents: content };
  }
  {
    const curLine = params.position.line + 1;
    const fn2 = findEnclosingFn(program, curLine);
    if (fn2) {
      const param = fn2.params.find((p) => p.name === word);
      if (param) {
        return {
          contents: {
            kind: import_node.MarkupKind.Markdown,
            value: `\`\`\`redscript
(param) ${param.name}: ${typeToString(param.type)}
\`\`\``
          }
        };
      }
      if (fn2.body) {
        const locals = collectLocals(fn2.body);
        const localType = locals.get(word);
        if (localType) {
          return {
            contents: {
              kind: import_node.MarkupKind.Markdown,
              value: `\`\`\`redscript
let ${word}: ${typeToString(localType)}
\`\`\``
            }
          };
        }
      }
    }
  }
  try {
    const importedPrograms = getImportedPrograms(source, params.textDocument.uri);
    for (const { prog, filePath } of importedPrograms) {
      const importedFn = findFunction(prog, word);
      if (importedFn) {
        const sig = formatFnSignature(importedFn);
        const docComment = extractDocComment(fs.readFileSync(filePath, "utf-8"), importedFn);
        const docLine = docComment ? `

${docComment}` : "";
        const content = {
          kind: import_node.MarkupKind.Markdown,
          value: `\`\`\`redscript
${sig}
\`\`\`${docLine}

*from ${path.basename(filePath)}*`
        };
        return { contents: content };
      }
      const importedStruct = prog.structs?.find((s) => s.name === word);
      if (importedStruct) {
        const fields = importedStruct.fields.map((f) => `  ${f.name}: ${typeToString(f.type)}`).join("\n");
        const content = {
          kind: import_node.MarkupKind.Markdown,
          value: `\`\`\`redscript
struct ${importedStruct.name} {
${fields}
}
\`\`\`

*from ${path.basename(filePath)}*`
        };
        return { contents: content };
      }
    }
  } catch {
  }
  return null;
});
function getImportedPrograms(source, fromUri) {
  const result = [];
  const FILE_IMPORT_RE = /^import\s+"([^"]+)"/gm;
  let m;
  while ((m = FILE_IMPORT_RE.exec(source)) !== null) {
    const resolved = resolveImportPath(m[1], fromUri);
    if (!resolved || !fs.existsSync(resolved)) continue;
    try {
      const src = fs.readFileSync(resolved, "utf-8");
      const tokens = new Lexer(src).tokenize();
      const prog = new Parser(tokens).parse(path.basename(resolved, ".mcrs"));
      result.push({ prog, filePath: resolved });
    } catch {
    }
  }
  const MOD_IMPORT_RE = /^import\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*::/gm;
  while ((m = MOD_IMPORT_RE.exec(source)) !== null) {
    const modName = m[1];
    const resolved = resolveImportPath(`stdlib/${modName}.mcrs`, fromUri);
    if (!resolved || !fs.existsSync(resolved)) continue;
    if (result.some((r) => r.filePath === resolved)) continue;
    try {
      const src = fs.readFileSync(resolved, "utf-8");
      const tokens = new Lexer(src).tokenize();
      const prog = new Parser(tokens).parse(modName);
      result.push({ prog, filePath: resolved });
    } catch {
    }
  }
  return result;
}
function resolveImportPath(importStr, fromUri) {
  try {
    const fromFile = (0, import_url.fileURLToPath)(fromUri);
    const fromDir = path.dirname(fromFile);
    if (importStr.startsWith(".")) {
      const resolved = path.resolve(fromDir, importStr);
      if (fs.existsSync(resolved)) return resolved;
      if (!resolved.endsWith(".mcrs") && fs.existsSync(resolved + ".mcrs")) return resolved + ".mcrs";
    } else {
      let dir = fromDir;
      for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, "package.json"))) {
          const candidate = path.join(dir, "src", importStr);
          if (fs.existsSync(candidate)) return candidate;
          if (fs.existsSync(candidate + ".mcrs")) return candidate + ".mcrs";
          const candidate2 = path.join(dir, importStr);
          if (fs.existsSync(candidate2)) return candidate2;
          if (fs.existsSync(candidate2 + ".mcrs")) return candidate2 + ".mcrs";
          break;
        }
        dir = path.dirname(dir);
      }
    }
  } catch {
  }
  return null;
}
connection.onDefinition((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const source = doc.getText();
  const lines = source.split("\n");
  const lineText = lines[params.position.line] ?? "";
  const ch = params.position.character;
  const fileImportMatch = lineText.match(/^import\s+"([^"]+)"/);
  if (fileImportMatch) {
    const importStr = fileImportMatch[1];
    const resolved = resolveImportPath(importStr, params.textDocument.uri);
    if (resolved) {
      return {
        uri: (0, import_url.pathToFileURL)(resolved).toString(),
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
      };
    }
  }
  const cached = parsedDocs.get(params.textDocument.uri);
  const program = cached?.program ?? null;
  if (!program) return null;
  const word = wordAt(source, params.position);
  if (!word) return null;
  let defWordStart = params.position.character;
  while (defWordStart > 0 && /\w/.test(lineText[defWordStart - 1])) defWordStart--;
  if (defWordStart > 0 && lineText[defWordStart - 1] === "@") return null;
  const defMap = buildDefinitionMap(program, source);
  const span = defMap.get(word);
  if (span) {
    const line = Math.max(0, span.line - 1);
    const col = Math.max(0, span.col - 1);
    return {
      uri: params.textDocument.uri,
      range: {
        start: { line, character: col },
        end: { line, character: col + word.length }
      }
    };
  }
  const defCurLine = params.position.line + 1;
  const enclosingFn = findEnclosingFn(program, defCurLine);
  if (enclosingFn) {
    if (enclosingFn.params.some((p) => p.name === word)) return null;
    if (enclosingFn.body) {
      const locals = collectLocals(enclosingFn.body);
      if (locals.has(word)) return null;
    }
  }
  for (const s of program.structs ?? []) {
    if (s.fields.some((f) => f.name === word)) return null;
  }
  try {
    const importedPrograms = getImportedPrograms(source, params.textDocument.uri);
    for (const { prog, filePath } of importedPrograms) {
      const importedDefMap = buildDefinitionMap(prog, fs.readFileSync(filePath, "utf-8"));
      const importedSpan = importedDefMap.get(word);
      if (importedSpan) {
        const line = Math.max(0, importedSpan.line - 1);
        const col = Math.max(0, importedSpan.col - 1);
        return {
          uri: (0, import_url.pathToFileURL)(filePath).toString(),
          range: {
            start: { line, character: col },
            end: { line, character: col + word.length }
          }
        };
      }
    }
  } catch {
  }
  const importDecl = program.imports?.find((im) => im.symbol === word);
  if (importDecl) {
    const resolved = resolveImportPath(`stdlib/${importDecl.moduleName}.mcrs`, params.textDocument.uri) ?? resolveImportPath(importDecl.moduleName, params.textDocument.uri) ?? resolveImportPath(importDecl.moduleName + ".mcrs", params.textDocument.uri);
    if (resolved) {
      return {
        uri: (0, import_url.pathToFileURL)(resolved).toString(),
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
      };
    }
  }
  return null;
});
var ARRAY_METHOD_COMPLETIONS = [
  { label: "push", kind: import_node.CompletionItemKind.Method, detail: "(value: int): void", documentation: "Append an element to the array." },
  { label: "pop", kind: import_node.CompletionItemKind.Method, detail: "(): int", documentation: "Remove and return the last element." },
  { label: "length", kind: import_node.CompletionItemKind.Property, detail: "int", documentation: "Number of elements in the array." }
];
function collectLocals(body) {
  const map = /* @__PURE__ */ new Map();
  const ENTITY_TYPE = { kind: "named", name: "int" };
  function walk(stmts) {
    for (const s of stmts) {
      if (s.kind === "let" && s.type) {
        map.set(s.name, s.type);
      } else if (s.kind === "foreach") {
        map.set(s.binding, ENTITY_TYPE);
        if (Array.isArray(s.body)) walk(s.body);
        continue;
      } else if (s.kind === "for") {
        if (s.binding) map.set(s.binding, { kind: "named", name: "int" });
      }
      const sub = s;
      if (Array.isArray(sub["body"])) walk(sub["body"]);
      if (Array.isArray(sub["then"])) walk(sub["then"]);
      if (Array.isArray(sub["else_"])) walk(sub["else_"]);
    }
  }
  walk(body);
  return map;
}
function getDotReceiver(lineText, charPos) {
  if (lineText[charPos - 1] !== ".") return null;
  let end = charPos - 2;
  while (end >= 0 && /\s/.test(lineText[end])) end--;
  if (end < 0) return null;
  let start = end;
  while (start > 0 && /[a-zA-Z0-9_]/.test(lineText[start - 1])) start--;
  return lineText.slice(start, end + 1) || null;
}
connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) {
    return [...KEYWORD_COMPLETIONS, ...TYPE_COMPLETIONS, ...BUILTIN_FN_COMPLETIONS, ...DECORATOR_COMPLETIONS];
  }
  const source = doc.getText();
  const lines = source.split("\n");
  const lineText = lines[params.position.line] ?? "";
  const charPos = params.position.character;
  const cached = parsedDocs.get(params.textDocument.uri);
  const program = cached?.program ?? null;
  const prevChar = lineText[charPos - 1];
  if (prevChar === "@") {
    const before = lineText.slice(0, charPos - 1).trim();
    const isExprContext = before.length > 0 && !/^(fn|let|if|while|for|return|@)/.test(before.split(/\s+/).pop() ?? "");
    if (isExprContext) {
      return SELECTOR_COMPLETIONS;
    }
    return DECORATOR_COMPLETIONS;
  }
  const dotReceiver = getDotReceiver(lineText, charPos);
  if (dotReceiver !== null) {
    const items2 = [];
    if (program) {
      const curLine = params.position.line + 1;
      const encFn = findEnclosingFn(program, curLine);
      const locals = encFn?.body ? collectLocals(encFn.body) : null;
      const receiverType = locals?.get(dotReceiver) ?? program.consts?.find((c) => c.name === dotReceiver)?.type ?? program.globals?.find((g) => g.name === dotReceiver)?.type;
      if (receiverType) {
        if (receiverType.kind === "array") {
          items2.push(...ARRAY_METHOD_COMPLETIONS);
        } else if (receiverType.kind === "named" || receiverType.kind === "struct") {
          const typeName = receiverType.name;
          const structDecl = program.structs?.find((s) => s.name === typeName);
          if (structDecl) {
            for (const f of structDecl.fields) {
              items2.push({
                label: f.name,
                kind: import_node.CompletionItemKind.Field,
                detail: typeToString(f.type)
              });
            }
          }
          const implBlock = program.implBlocks?.find((ib) => ib.typeName === typeName);
          if (implBlock) {
            for (const m of implBlock.methods) {
              const params_ = m.params.map((p) => `${p.name}: ${typeToString(p.type)}`).join(", ");
              items2.push({
                label: m.name,
                kind: import_node.CompletionItemKind.Method,
                detail: `(${params_}): ${typeToString(m.returnType)}`
              });
            }
          }
        }
      } else {
        for (const ib of program.implBlocks ?? []) {
          for (const m of ib.methods) {
            items2.push({ label: m.name, kind: import_node.CompletionItemKind.Method });
          }
        }
        items2.push(...ARRAY_METHOD_COMPLETIONS);
      }
    }
    return items2;
  }
  const items = [
    ...KEYWORD_COMPLETIONS,
    ...TYPE_COMPLETIONS,
    ...BUILTIN_FN_COMPLETIONS,
    ...DECORATOR_COMPLETIONS
  ];
  if (program) {
    for (const fn of program.declarations) {
      items.push({ label: fn.name, kind: import_node.CompletionItemKind.Function });
    }
    for (const s of program.structs ?? []) {
      items.push({ label: s.name, kind: import_node.CompletionItemKind.Struct });
    }
    for (const e of program.enums ?? []) {
      items.push({ label: e.name, kind: import_node.CompletionItemKind.Enum });
    }
    for (const c of program.consts ?? []) {
      items.push({ label: c.name, kind: import_node.CompletionItemKind.Constant });
    }
    for (const g of program.globals ?? []) {
      items.push({ label: g.name, kind: import_node.CompletionItemKind.Variable });
    }
    const curLine2 = params.position.line + 1;
    const encFn2 = findEnclosingFn(program, curLine2);
    if (encFn2?.body) {
      for (const [name, typ] of collectLocals(encFn2.body)) {
        items.push({
          label: name,
          kind: import_node.CompletionItemKind.Variable,
          detail: typeToString(typ)
        });
      }
    }
  }
  try {
    const importedPrograms = getImportedPrograms(source, params.textDocument.uri);
    for (const { prog, filePath } of importedPrograms) {
      for (const fn of prog.declarations) {
        const paramList = fn.params.map((p) => `${p.name}: ${typeToString(p.type)}`).join(", ");
        items.push({
          label: fn.name,
          kind: import_node.CompletionItemKind.Function,
          detail: `(${paramList}) \u2192 ${typeToString(fn.returnType ?? { kind: "named", name: "void" })}`,
          documentation: `from ${path.basename(filePath)}`
        });
      }
      for (const s of prog.structs ?? []) {
        items.push({ label: s.name, kind: import_node.CompletionItemKind.Struct, documentation: `from ${path.basename(filePath)}` });
      }
    }
  } catch {
  }
  return items;
});
function getWordRangeAtPosition(doc, position) {
  const text = doc.getText();
  const offset = doc.offsetAt(position);
  let start = offset;
  let end = offset;
  while (start > 0 && /[a-zA-Z0-9_]/.test(text[start - 1])) start--;
  while (end < text.length && /[a-zA-Z0-9_]/.test(text[end])) end++;
  if (start === end) return null;
  return { start: doc.positionAt(start), end: doc.positionAt(end) };
}
connection.onSignatureHelp((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const parsed = parsedDocs.get(params.textDocument.uri);
  if (!parsed?.program) return null;
  const text = doc.getText();
  const offset = doc.offsetAt(params.position);
  let depth = 0;
  let i = offset - 1;
  let activeParam = 0;
  while (i >= 0) {
    const ch = text[i];
    if (ch === ")") depth++;
    else if (ch === "(") {
      if (depth === 0) break;
      depth--;
    } else if (ch === "," && depth === 0) activeParam++;
    i--;
  }
  if (i < 0) return null;
  let nameEnd = i - 1;
  while (nameEnd >= 0 && /\s/.test(text[nameEnd])) nameEnd--;
  let nameStart = nameEnd;
  while (nameStart > 0 && /[a-zA-Z0-9_]/.test(text[nameStart - 1])) nameStart--;
  const fnName = text.slice(nameStart, nameEnd + 1);
  if (!fnName) return null;
  const fn = parsed.program.declarations.find((s) => s.name === fnName);
  const builtin = ALL_BUILTINS[fnName];
  if (!fn && !builtin) return null;
  let label;
  let paramsList;
  if (fn) {
    paramsList = fn.params.map((p) => `${p.name}: ${typeToString(p.type)}`);
    label = `fn ${fn.name}(${paramsList.join(", ")}): ${typeToString(fn.returnType)}`;
  } else {
    paramsList = builtin.params?.map((p) => `${p.name}: ${p.type}`) ?? [];
    label = `${builtin.name}(${paramsList.join(", ")}): ${builtin.returns ?? "void"}`;
  }
  const paramInfos = paramsList.map((p) => ({ label: p }));
  return {
    signatures: [
      {
        label,
        parameters: paramInfos,
        activeParameter: Math.min(activeParam, Math.max(0, paramInfos.length - 1))
      }
    ],
    activeSignature: 0,
    activeParameter: Math.min(activeParam, Math.max(0, paramInfos.length - 1))
  };
});
connection.onRequest(
  "textDocument/inlayHint",
  (params) => {
    const parsed = parsedDocs.get(params.textDocument.uri);
    if (!parsed?.program) return [];
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];
    const hints = [];
    function walkBlock(stmts) {
      const locals = collectLocals(stmts);
      for (const stmt of stmts) {
        if (stmt.kind === "let" && !stmt.type) {
          const inferredType = locals.get(stmt.name);
          if (!inferredType) continue;
          const spanVal = stmt.span;
          if (!spanVal) continue;
          const line = Math.max(0, spanVal.line - 1);
          const lineText = source.split("\n")[line] ?? "";
          const nameEnd = lineText.indexOf(stmt.name) + stmt.name.length;
          hints.push({
            position: { line, character: nameEnd },
            label: `: ${typeToString(inferredType)}`,
            kind: import_node.InlayHintKind.Type,
            paddingLeft: false
          });
        }
        if (stmt.kind === "if" || stmt.kind === "while" || stmt.kind === "for") {
          const s = stmt;
          const then_ = s["then"];
          if (Array.isArray(then_)) walkBlock(then_);
          const else_ = s["else_"];
          if (Array.isArray(else_)) walkBlock(else_);
          const body = s["body"];
          if (Array.isArray(body)) walkBlock(body);
        }
        if (stmt.kind === "foreach") {
          const s = stmt;
          const body = s["body"];
          if (Array.isArray(body)) walkBlock(body);
        }
      }
    }
    const source = doc.getText();
    parsed.program.declarations.forEach((top) => {
      if (top.body) walkBlock(top.body);
    });
    return hints;
  }
);
connection.onReferences((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const parsed = parsedDocs.get(params.textDocument.uri);
  if (!parsed?.program) return [];
  const wordRange = getWordRangeAtPosition(doc, params.position);
  if (!wordRange) return [];
  const word = doc.getText(wordRange);
  if (!word) return [];
  const text = doc.getText();
  const locations = [];
  const regex = new RegExp(`\\b${word}\\b`, "g");
  let match;
  while ((match = regex.exec(text)) !== null) {
    const start = doc.positionAt(match.index);
    const end = doc.positionAt(match.index + word.length);
    locations.push({
      uri: params.textDocument.uri,
      range: { start, end }
    });
  }
  return locations;
});
connection.onRenameRequest((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const wordRange = getWordRangeAtPosition(doc, params.position);
  if (!wordRange) return null;
  const word = doc.getText(wordRange);
  if (!word) return null;
  const text = doc.getText();
  const edits = [];
  const regex = new RegExp(`\\b${word}\\b`, "g");
  let match;
  while ((match = regex.exec(text)) !== null) {
    const start = doc.positionAt(match.index);
    const end = doc.positionAt(match.index + word.length);
    edits.push({ range: { start, end }, newText: params.newName });
  }
  return { changes: { [params.textDocument.uri]: edits } };
});
documents.listen(connection);
connection.listen();
