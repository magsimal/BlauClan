var VueFlowCore = function(exports, vue) {
  "use strict";
  function tryOnScopeDispose(fn) {
    if (vue.getCurrentScope()) {
      vue.onScopeDispose(fn);
      return true;
    }
    return false;
  }
  function toValue(r) {
    return typeof r === "function" ? r() : vue.unref(r);
  }
  function toReactive(objectRef) {
    if (!vue.isRef(objectRef))
      return vue.reactive(objectRef);
    const proxy = new Proxy({}, {
      get(_, p, receiver) {
        return vue.unref(Reflect.get(objectRef.value, p, receiver));
      },
      set(_, p, value) {
        if (vue.isRef(objectRef.value[p]) && !vue.isRef(value))
          objectRef.value[p].value = value;
        else
          objectRef.value[p] = value;
        return true;
      },
      deleteProperty(_, p) {
        return Reflect.deleteProperty(objectRef.value, p);
      },
      has(_, p) {
        return Reflect.has(objectRef.value, p);
      },
      ownKeys() {
        return Object.keys(objectRef.value);
      },
      getOwnPropertyDescriptor() {
        return {
          enumerable: true,
          configurable: true
        };
      }
    });
    return vue.reactive(proxy);
  }
  const isClient = typeof window !== "undefined" && typeof document !== "undefined";
  const isDef$1 = (val) => typeof val !== "undefined";
  const toString = Object.prototype.toString;
  const isObject = (val) => toString.call(val) === "[object Object]";
  const noop$2 = () => {
  };
  function createFilterWrapper(filter2, fn) {
    function wrapper(...args) {
      return new Promise((resolve, reject) => {
        Promise.resolve(filter2(() => fn.apply(this, args), { fn, thisArg: this, args })).then(resolve).catch(reject);
      });
    }
    return wrapper;
  }
  const bypassFilter = (invoke) => {
    return invoke();
  };
  function pausableFilter(extendFilter = bypassFilter) {
    const isActive = vue.ref(true);
    function pause() {
      isActive.value = false;
    }
    function resume() {
      isActive.value = true;
    }
    const eventFilter = (...args) => {
      if (isActive.value)
        extendFilter(...args);
    };
    return { isActive: vue.readonly(isActive), pause, resume, eventFilter };
  }
  function promiseTimeout(ms, throwOnTimeout = false, reason = "Timeout") {
    return new Promise((resolve, reject) => {
      if (throwOnTimeout)
        setTimeout(() => reject(reason), ms);
      else
        setTimeout(resolve, ms);
    });
  }
  function watchWithFilter(source, cb, options = {}) {
    const {
      eventFilter = bypassFilter,
      ...watchOptions
    } = options;
    return vue.watch(
      source,
      createFilterWrapper(
        eventFilter,
        cb
      ),
      watchOptions
    );
  }
  function watchPausable(source, cb, options = {}) {
    const {
      eventFilter: filter2,
      ...watchOptions
    } = options;
    const { eventFilter, pause, resume, isActive } = pausableFilter(filter2);
    const stop = watchWithFilter(
      source,
      cb,
      {
        ...watchOptions,
        eventFilter
      }
    );
    return { stop, pause, resume, isActive };
  }
  function toRefs(objectRef, options = {}) {
    if (!vue.isRef(objectRef))
      return vue.toRefs(objectRef);
    const result = Array.isArray(objectRef.value) ? Array.from({ length: objectRef.value.length }) : {};
    for (const key in objectRef.value) {
      result[key] = vue.customRef(() => ({
        get() {
          return objectRef.value[key];
        },
        set(v) {
          var _a;
          const replaceRef = (_a = toValue(options.replaceRef)) != null ? _a : true;
          if (replaceRef) {
            if (Array.isArray(objectRef.value)) {
              const copy = [...objectRef.value];
              copy[key] = v;
              objectRef.value = copy;
            } else {
              const newObject = { ...objectRef.value, [key]: v };
              Object.setPrototypeOf(newObject, Object.getPrototypeOf(objectRef.value));
              objectRef.value = newObject;
            }
          } else {
            objectRef.value[key] = v;
          }
        }
      }));
    }
    return result;
  }
  function createUntil(r, isNot = false) {
    function toMatch(condition, { flush = "sync", deep = false, timeout: timeout2, throwOnTimeout } = {}) {
      let stop = null;
      const watcher = new Promise((resolve) => {
        stop = vue.watch(
          r,
          (v) => {
            if (condition(v) !== isNot) {
              stop == null ? void 0 : stop();
              resolve(v);
            }
          },
          {
            flush,
            deep,
            immediate: true
          }
        );
      });
      const promises = [watcher];
      if (timeout2 != null) {
        promises.push(
          promiseTimeout(timeout2, throwOnTimeout).then(() => toValue(r)).finally(() => stop == null ? void 0 : stop())
        );
      }
      return Promise.race(promises);
    }
    function toBe(value, options) {
      if (!vue.isRef(value))
        return toMatch((v) => v === value, options);
      const { flush = "sync", deep = false, timeout: timeout2, throwOnTimeout } = options != null ? options : {};
      let stop = null;
      const watcher = new Promise((resolve) => {
        stop = vue.watch(
          [r, value],
          ([v1, v2]) => {
            if (isNot !== (v1 === v2)) {
              stop == null ? void 0 : stop();
              resolve(v1);
            }
          },
          {
            flush,
            deep,
            immediate: true
          }
        );
      });
      const promises = [watcher];
      if (timeout2 != null) {
        promises.push(
          promiseTimeout(timeout2, throwOnTimeout).then(() => toValue(r)).finally(() => {
            stop == null ? void 0 : stop();
            return toValue(r);
          })
        );
      }
      return Promise.race(promises);
    }
    function toBeTruthy(options) {
      return toMatch((v) => Boolean(v), options);
    }
    function toBeNull(options) {
      return toBe(null, options);
    }
    function toBeUndefined(options) {
      return toBe(void 0, options);
    }
    function toBeNaN(options) {
      return toMatch(Number.isNaN, options);
    }
    function toContains(value, options) {
      return toMatch((v) => {
        const array2 = Array.from(v);
        return array2.includes(value) || array2.includes(toValue(value));
      }, options);
    }
    function changed(options) {
      return changedTimes(1, options);
    }
    function changedTimes(n = 1, options) {
      let count = -1;
      return toMatch(() => {
        count += 1;
        return count >= n;
      }, options);
    }
    if (Array.isArray(toValue(r))) {
      const instance = {
        toMatch,
        toContains,
        changed,
        changedTimes,
        get not() {
          return createUntil(r, !isNot);
        }
      };
      return instance;
    } else {
      const instance = {
        toMatch,
        toBe,
        toBeTruthy,
        toBeNull,
        toBeNaN,
        toBeUndefined,
        changed,
        changedTimes,
        get not() {
          return createUntil(r, !isNot);
        }
      };
      return instance;
    }
  }
  function until(r) {
    return createUntil(r);
  }
  function unrefElement(elRef) {
    var _a;
    const plain = toValue(elRef);
    return (_a = plain == null ? void 0 : plain.$el) != null ? _a : plain;
  }
  const defaultWindow = isClient ? window : void 0;
  function useEventListener(...args) {
    let target;
    let events;
    let listeners;
    let options;
    if (typeof args[0] === "string" || Array.isArray(args[0])) {
      [events, listeners, options] = args;
      target = defaultWindow;
    } else {
      [target, events, listeners, options] = args;
    }
    if (!target)
      return noop$2;
    if (!Array.isArray(events))
      events = [events];
    if (!Array.isArray(listeners))
      listeners = [listeners];
    const cleanups = [];
    const cleanup = () => {
      cleanups.forEach((fn) => fn());
      cleanups.length = 0;
    };
    const register = (el, event, listener, options2) => {
      el.addEventListener(event, listener, options2);
      return () => el.removeEventListener(event, listener, options2);
    };
    const stopWatch = vue.watch(
      () => [unrefElement(target), toValue(options)],
      ([el, options2]) => {
        cleanup();
        if (!el)
          return;
        const optionsClone = isObject(options2) ? { ...options2 } : options2;
        cleanups.push(
          ...events.flatMap((event) => {
            return listeners.map((listener) => register(el, event, listener, optionsClone));
          })
        );
      },
      { immediate: true, flush: "post" }
    );
    const stop = () => {
      stopWatch();
      cleanup();
    };
    tryOnScopeDispose(stop);
    return stop;
  }
  function createKeyPredicate$1(keyFilter) {
    if (typeof keyFilter === "function")
      return keyFilter;
    else if (typeof keyFilter === "string")
      return (event) => event.key === keyFilter;
    else if (Array.isArray(keyFilter))
      return (event) => keyFilter.includes(event.key);
    return () => true;
  }
  function onKeyStroke(...args) {
    let key;
    let handler;
    let options = {};
    if (args.length === 3) {
      key = args[0];
      handler = args[1];
      options = args[2];
    } else if (args.length === 2) {
      if (typeof args[1] === "object") {
        key = true;
        handler = args[0];
        options = args[1];
      } else {
        key = args[0];
        handler = args[1];
      }
    } else {
      key = true;
      handler = args[0];
    }
    const {
      target = defaultWindow,
      eventName = "keydown",
      passive = false,
      dedupe = false
    } = options;
    const predicate = createKeyPredicate$1(key);
    const listener = (e) => {
      if (e.repeat && toValue(dedupe))
        return;
      if (predicate(e))
        handler(e);
    };
    return useEventListener(target, eventName, listener, passive);
  }
  function cloneFnJSON(source) {
    return JSON.parse(JSON.stringify(source));
  }
  function useVModel(props, key, emit, options = {}) {
    var _a, _b, _c;
    const {
      clone = false,
      passive = false,
      eventName,
      deep = false,
      defaultValue,
      shouldEmit
    } = options;
    const vm = vue.getCurrentInstance();
    const _emit = emit || (vm == null ? void 0 : vm.emit) || ((_a = vm == null ? void 0 : vm.$emit) == null ? void 0 : _a.bind(vm)) || ((_c = (_b = vm == null ? void 0 : vm.proxy) == null ? void 0 : _b.$emit) == null ? void 0 : _c.bind(vm == null ? void 0 : vm.proxy));
    let event = eventName;
    if (!key) {
      {
        key = "modelValue";
      }
    }
    event = event || `update:${key.toString()}`;
    const cloneFn = (val) => !clone ? val : typeof clone === "function" ? clone(val) : cloneFnJSON(val);
    const getValue = () => isDef$1(props[key]) ? cloneFn(props[key]) : defaultValue;
    const triggerEmit = (value) => {
      if (shouldEmit) {
        if (shouldEmit(value))
          _emit(event, value);
      } else {
        _emit(event, value);
      }
    };
    if (passive) {
      const initialValue = getValue();
      const proxy = vue.ref(initialValue);
      let isUpdating = false;
      vue.watch(
        () => props[key],
        (v) => {
          if (!isUpdating) {
            isUpdating = true;
            proxy.value = cloneFn(v);
            vue.nextTick(() => isUpdating = false);
          }
        }
      );
      vue.watch(
        proxy,
        (v) => {
          if (!isUpdating && (v !== props[key] || deep))
            triggerEmit(v);
        },
        { deep }
      );
      return proxy;
    } else {
      return vue.computed({
        get() {
          return getValue();
        },
        set(value) {
          triggerEmit(value);
        }
      });
    }
  }
  var noop$1 = { value: () => {
  } };
  function dispatch() {
    for (var i = 0, n = arguments.length, _ = {}, t; i < n; ++i) {
      if (!(t = arguments[i] + "") || t in _ || /[\s.]/.test(t))
        throw new Error("illegal type: " + t);
      _[t] = [];
    }
    return new Dispatch(_);
  }
  function Dispatch(_) {
    this._ = _;
  }
  function parseTypenames$1(typenames, types) {
    return typenames.trim().split(/^|\s+/).map(function(t) {
      var name = "", i = t.indexOf(".");
      if (i >= 0)
        name = t.slice(i + 1), t = t.slice(0, i);
      if (t && !types.hasOwnProperty(t))
        throw new Error("unknown type: " + t);
      return { type: t, name };
    });
  }
  Dispatch.prototype = dispatch.prototype = {
    constructor: Dispatch,
    on: function(typename, callback) {
      var _ = this._, T = parseTypenames$1(typename + "", _), t, i = -1, n = T.length;
      if (arguments.length < 2) {
        while (++i < n)
          if ((t = (typename = T[i]).type) && (t = get$1(_[t], typename.name)))
            return t;
        return;
      }
      if (callback != null && typeof callback !== "function")
        throw new Error("invalid callback: " + callback);
      while (++i < n) {
        if (t = (typename = T[i]).type)
          _[t] = set$1(_[t], typename.name, callback);
        else if (callback == null)
          for (t in _)
            _[t] = set$1(_[t], typename.name, null);
      }
      return this;
    },
    copy: function() {
      var copy = {}, _ = this._;
      for (var t in _)
        copy[t] = _[t].slice();
      return new Dispatch(copy);
    },
    call: function(type, that) {
      if ((n = arguments.length - 2) > 0)
        for (var args = new Array(n), i = 0, n, t; i < n; ++i)
          args[i] = arguments[i + 2];
      if (!this._.hasOwnProperty(type))
        throw new Error("unknown type: " + type);
      for (t = this._[type], i = 0, n = t.length; i < n; ++i)
        t[i].value.apply(that, args);
    },
    apply: function(type, that, args) {
      if (!this._.hasOwnProperty(type))
        throw new Error("unknown type: " + type);
      for (var t = this._[type], i = 0, n = t.length; i < n; ++i)
        t[i].value.apply(that, args);
    }
  };
  function get$1(type, name) {
    for (var i = 0, n = type.length, c; i < n; ++i) {
      if ((c = type[i]).name === name) {
        return c.value;
      }
    }
  }
  function set$1(type, name, callback) {
    for (var i = 0, n = type.length; i < n; ++i) {
      if (type[i].name === name) {
        type[i] = noop$1, type = type.slice(0, i).concat(type.slice(i + 1));
        break;
      }
    }
    if (callback != null)
      type.push({ name, value: callback });
    return type;
  }
  var xhtml = "http://www.w3.org/1999/xhtml";
  const namespaces = {
    svg: "http://www.w3.org/2000/svg",
    xhtml,
    xlink: "http://www.w3.org/1999/xlink",
    xml: "http://www.w3.org/XML/1998/namespace",
    xmlns: "http://www.w3.org/2000/xmlns/"
  };
  function namespace(name) {
    var prefix = name += "", i = prefix.indexOf(":");
    if (i >= 0 && (prefix = name.slice(0, i)) !== "xmlns")
      name = name.slice(i + 1);
    return namespaces.hasOwnProperty(prefix) ? { space: namespaces[prefix], local: name } : name;
  }
  function creatorInherit(name) {
    return function() {
      var document2 = this.ownerDocument, uri = this.namespaceURI;
      return uri === xhtml && document2.documentElement.namespaceURI === xhtml ? document2.createElement(name) : document2.createElementNS(uri, name);
    };
  }
  function creatorFixed(fullname) {
    return function() {
      return this.ownerDocument.createElementNS(fullname.space, fullname.local);
    };
  }
  function creator(name) {
    var fullname = namespace(name);
    return (fullname.local ? creatorFixed : creatorInherit)(fullname);
  }
  function none() {
  }
  function selector(selector2) {
    return selector2 == null ? none : function() {
      return this.querySelector(selector2);
    };
  }
  function selection_select(select2) {
    if (typeof select2 !== "function")
      select2 = selector(select2);
    for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i) {
        if ((node = group[i]) && (subnode = select2.call(node, node.__data__, i, group))) {
          if ("__data__" in node)
            subnode.__data__ = node.__data__;
          subgroup[i] = subnode;
        }
      }
    }
    return new Selection$1(subgroups, this._parents);
  }
  function array(x) {
    return x == null ? [] : Array.isArray(x) ? x : Array.from(x);
  }
  function empty() {
    return [];
  }
  function selectorAll(selector2) {
    return selector2 == null ? empty : function() {
      return this.querySelectorAll(selector2);
    };
  }
  function arrayAll(select2) {
    return function() {
      return array(select2.apply(this, arguments));
    };
  }
  function selection_selectAll(select2) {
    if (typeof select2 === "function")
      select2 = arrayAll(select2);
    else
      select2 = selectorAll(select2);
    for (var groups = this._groups, m = groups.length, subgroups = [], parents = [], j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          subgroups.push(select2.call(node, node.__data__, i, group));
          parents.push(node);
        }
      }
    }
    return new Selection$1(subgroups, parents);
  }
  function matcher(selector2) {
    return function() {
      return this.matches(selector2);
    };
  }
  function childMatcher(selector2) {
    return function(node) {
      return node.matches(selector2);
    };
  }
  var find = Array.prototype.find;
  function childFind(match) {
    return function() {
      return find.call(this.children, match);
    };
  }
  function childFirst() {
    return this.firstElementChild;
  }
  function selection_selectChild(match) {
    return this.select(match == null ? childFirst : childFind(typeof match === "function" ? match : childMatcher(match)));
  }
  var filter = Array.prototype.filter;
  function children() {
    return Array.from(this.children);
  }
  function childrenFilter(match) {
    return function() {
      return filter.call(this.children, match);
    };
  }
  function selection_selectChildren(match) {
    return this.selectAll(match == null ? children : childrenFilter(typeof match === "function" ? match : childMatcher(match)));
  }
  function selection_filter(match) {
    if (typeof match !== "function")
      match = matcher(match);
    for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i) {
        if ((node = group[i]) && match.call(node, node.__data__, i, group)) {
          subgroup.push(node);
        }
      }
    }
    return new Selection$1(subgroups, this._parents);
  }
  function sparse(update) {
    return new Array(update.length);
  }
  function selection_enter() {
    return new Selection$1(this._enter || this._groups.map(sparse), this._parents);
  }
  function EnterNode(parent, datum2) {
    this.ownerDocument = parent.ownerDocument;
    this.namespaceURI = parent.namespaceURI;
    this._next = null;
    this._parent = parent;
    this.__data__ = datum2;
  }
  EnterNode.prototype = {
    constructor: EnterNode,
    appendChild: function(child) {
      return this._parent.insertBefore(child, this._next);
    },
    insertBefore: function(child, next) {
      return this._parent.insertBefore(child, next);
    },
    querySelector: function(selector2) {
      return this._parent.querySelector(selector2);
    },
    querySelectorAll: function(selector2) {
      return this._parent.querySelectorAll(selector2);
    }
  };
  function constant$3(x) {
    return function() {
      return x;
    };
  }
  function bindIndex(parent, group, enter, update, exit, data) {
    var i = 0, node, groupLength = group.length, dataLength = data.length;
    for (; i < dataLength; ++i) {
      if (node = group[i]) {
        node.__data__ = data[i];
        update[i] = node;
      } else {
        enter[i] = new EnterNode(parent, data[i]);
      }
    }
    for (; i < groupLength; ++i) {
      if (node = group[i]) {
        exit[i] = node;
      }
    }
  }
  function bindKey(parent, group, enter, update, exit, data, key) {
    var i, node, nodeByKeyValue = /* @__PURE__ */ new Map(), groupLength = group.length, dataLength = data.length, keyValues = new Array(groupLength), keyValue;
    for (i = 0; i < groupLength; ++i) {
      if (node = group[i]) {
        keyValues[i] = keyValue = key.call(node, node.__data__, i, group) + "";
        if (nodeByKeyValue.has(keyValue)) {
          exit[i] = node;
        } else {
          nodeByKeyValue.set(keyValue, node);
        }
      }
    }
    for (i = 0; i < dataLength; ++i) {
      keyValue = key.call(parent, data[i], i, data) + "";
      if (node = nodeByKeyValue.get(keyValue)) {
        update[i] = node;
        node.__data__ = data[i];
        nodeByKeyValue.delete(keyValue);
      } else {
        enter[i] = new EnterNode(parent, data[i]);
      }
    }
    for (i = 0; i < groupLength; ++i) {
      if ((node = group[i]) && nodeByKeyValue.get(keyValues[i]) === node) {
        exit[i] = node;
      }
    }
  }
  function datum(node) {
    return node.__data__;
  }
  function selection_data(value, key) {
    if (!arguments.length)
      return Array.from(this, datum);
    var bind = key ? bindKey : bindIndex, parents = this._parents, groups = this._groups;
    if (typeof value !== "function")
      value = constant$3(value);
    for (var m = groups.length, update = new Array(m), enter = new Array(m), exit = new Array(m), j = 0; j < m; ++j) {
      var parent = parents[j], group = groups[j], groupLength = group.length, data = arraylike(value.call(parent, parent && parent.__data__, j, parents)), dataLength = data.length, enterGroup = enter[j] = new Array(dataLength), updateGroup = update[j] = new Array(dataLength), exitGroup = exit[j] = new Array(groupLength);
      bind(parent, group, enterGroup, updateGroup, exitGroup, data, key);
      for (var i0 = 0, i1 = 0, previous, next; i0 < dataLength; ++i0) {
        if (previous = enterGroup[i0]) {
          if (i0 >= i1)
            i1 = i0 + 1;
          while (!(next = updateGroup[i1]) && ++i1 < dataLength)
            ;
          previous._next = next || null;
        }
      }
    }
    update = new Selection$1(update, parents);
    update._enter = enter;
    update._exit = exit;
    return update;
  }
  function arraylike(data) {
    return typeof data === "object" && "length" in data ? data : Array.from(data);
  }
  function selection_exit() {
    return new Selection$1(this._exit || this._groups.map(sparse), this._parents);
  }
  function selection_join(onenter, onupdate, onexit) {
    var enter = this.enter(), update = this, exit = this.exit();
    if (typeof onenter === "function") {
      enter = onenter(enter);
      if (enter)
        enter = enter.selection();
    } else {
      enter = enter.append(onenter + "");
    }
    if (onupdate != null) {
      update = onupdate(update);
      if (update)
        update = update.selection();
    }
    if (onexit == null)
      exit.remove();
    else
      onexit(exit);
    return enter && update ? enter.merge(update).order() : update;
  }
  function selection_merge(context) {
    var selection2 = context.selection ? context.selection() : context;
    for (var groups0 = this._groups, groups1 = selection2._groups, m0 = groups0.length, m1 = groups1.length, m = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m; ++j) {
      for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge = merges[j] = new Array(n), node, i = 0; i < n; ++i) {
        if (node = group0[i] || group1[i]) {
          merge[i] = node;
        }
      }
    }
    for (; j < m0; ++j) {
      merges[j] = groups0[j];
    }
    return new Selection$1(merges, this._parents);
  }
  function selection_order() {
    for (var groups = this._groups, j = -1, m = groups.length; ++j < m; ) {
      for (var group = groups[j], i = group.length - 1, next = group[i], node; --i >= 0; ) {
        if (node = group[i]) {
          if (next && node.compareDocumentPosition(next) ^ 4)
            next.parentNode.insertBefore(node, next);
          next = node;
        }
      }
    }
    return this;
  }
  function selection_sort(compare) {
    if (!compare)
      compare = ascending;
    function compareNode(a, b) {
      return a && b ? compare(a.__data__, b.__data__) : !a - !b;
    }
    for (var groups = this._groups, m = groups.length, sortgroups = new Array(m), j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, sortgroup = sortgroups[j] = new Array(n), node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          sortgroup[i] = node;
        }
      }
      sortgroup.sort(compareNode);
    }
    return new Selection$1(sortgroups, this._parents).order();
  }
  function ascending(a, b) {
    return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
  }
  function selection_call() {
    var callback = arguments[0];
    arguments[0] = this;
    callback.apply(null, arguments);
    return this;
  }
  function selection_nodes() {
    return Array.from(this);
  }
  function selection_node() {
    for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
      for (var group = groups[j], i = 0, n = group.length; i < n; ++i) {
        var node = group[i];
        if (node)
          return node;
      }
    }
    return null;
  }
  function selection_size() {
    let size = 0;
    for (const node of this)
      ++size;
    return size;
  }
  function selection_empty() {
    return !this.node();
  }
  function selection_each(callback) {
    for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
      for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i) {
        if (node = group[i])
          callback.call(node, node.__data__, i, group);
      }
    }
    return this;
  }
  function attrRemove$1(name) {
    return function() {
      this.removeAttribute(name);
    };
  }
  function attrRemoveNS$1(fullname) {
    return function() {
      this.removeAttributeNS(fullname.space, fullname.local);
    };
  }
  function attrConstant$1(name, value) {
    return function() {
      this.setAttribute(name, value);
    };
  }
  function attrConstantNS$1(fullname, value) {
    return function() {
      this.setAttributeNS(fullname.space, fullname.local, value);
    };
  }
  function attrFunction$1(name, value) {
    return function() {
      var v = value.apply(this, arguments);
      if (v == null)
        this.removeAttribute(name);
      else
        this.setAttribute(name, v);
    };
  }
  function attrFunctionNS$1(fullname, value) {
    return function() {
      var v = value.apply(this, arguments);
      if (v == null)
        this.removeAttributeNS(fullname.space, fullname.local);
      else
        this.setAttributeNS(fullname.space, fullname.local, v);
    };
  }
  function selection_attr(name, value) {
    var fullname = namespace(name);
    if (arguments.length < 2) {
      var node = this.node();
      return fullname.local ? node.getAttributeNS(fullname.space, fullname.local) : node.getAttribute(fullname);
    }
    return this.each((value == null ? fullname.local ? attrRemoveNS$1 : attrRemove$1 : typeof value === "function" ? fullname.local ? attrFunctionNS$1 : attrFunction$1 : fullname.local ? attrConstantNS$1 : attrConstant$1)(fullname, value));
  }
  function defaultView(node) {
    return node.ownerDocument && node.ownerDocument.defaultView || node.document && node || node.defaultView;
  }
  function styleRemove$1(name) {
    return function() {
      this.style.removeProperty(name);
    };
  }
  function styleConstant$1(name, value, priority) {
    return function() {
      this.style.setProperty(name, value, priority);
    };
  }
  function styleFunction$1(name, value, priority) {
    return function() {
      var v = value.apply(this, arguments);
      if (v == null)
        this.style.removeProperty(name);
      else
        this.style.setProperty(name, v, priority);
    };
  }
  function selection_style(name, value, priority) {
    return arguments.length > 1 ? this.each((value == null ? styleRemove$1 : typeof value === "function" ? styleFunction$1 : styleConstant$1)(name, value, priority == null ? "" : priority)) : styleValue(this.node(), name);
  }
  function styleValue(node, name) {
    return node.style.getPropertyValue(name) || defaultView(node).getComputedStyle(node, null).getPropertyValue(name);
  }
  function propertyRemove(name) {
    return function() {
      delete this[name];
    };
  }
  function propertyConstant(name, value) {
    return function() {
      this[name] = value;
    };
  }
  function propertyFunction(name, value) {
    return function() {
      var v = value.apply(this, arguments);
      if (v == null)
        delete this[name];
      else
        this[name] = v;
    };
  }
  function selection_property(name, value) {
    return arguments.length > 1 ? this.each((value == null ? propertyRemove : typeof value === "function" ? propertyFunction : propertyConstant)(name, value)) : this.node()[name];
  }
  function classArray(string) {
    return string.trim().split(/^|\s+/);
  }
  function classList(node) {
    return node.classList || new ClassList(node);
  }
  function ClassList(node) {
    this._node = node;
    this._names = classArray(node.getAttribute("class") || "");
  }
  ClassList.prototype = {
    add: function(name) {
      var i = this._names.indexOf(name);
      if (i < 0) {
        this._names.push(name);
        this._node.setAttribute("class", this._names.join(" "));
      }
    },
    remove: function(name) {
      var i = this._names.indexOf(name);
      if (i >= 0) {
        this._names.splice(i, 1);
        this._node.setAttribute("class", this._names.join(" "));
      }
    },
    contains: function(name) {
      return this._names.indexOf(name) >= 0;
    }
  };
  function classedAdd(node, names) {
    var list = classList(node), i = -1, n = names.length;
    while (++i < n)
      list.add(names[i]);
  }
  function classedRemove(node, names) {
    var list = classList(node), i = -1, n = names.length;
    while (++i < n)
      list.remove(names[i]);
  }
  function classedTrue(names) {
    return function() {
      classedAdd(this, names);
    };
  }
  function classedFalse(names) {
    return function() {
      classedRemove(this, names);
    };
  }
  function classedFunction(names, value) {
    return function() {
      (value.apply(this, arguments) ? classedAdd : classedRemove)(this, names);
    };
  }
  function selection_classed(name, value) {
    var names = classArray(name + "");
    if (arguments.length < 2) {
      var list = classList(this.node()), i = -1, n = names.length;
      while (++i < n)
        if (!list.contains(names[i]))
          return false;
      return true;
    }
    return this.each((typeof value === "function" ? classedFunction : value ? classedTrue : classedFalse)(names, value));
  }
  function textRemove() {
    this.textContent = "";
  }
  function textConstant$1(value) {
    return function() {
      this.textContent = value;
    };
  }
  function textFunction$1(value) {
    return function() {
      var v = value.apply(this, arguments);
      this.textContent = v == null ? "" : v;
    };
  }
  function selection_text(value) {
    return arguments.length ? this.each(value == null ? textRemove : (typeof value === "function" ? textFunction$1 : textConstant$1)(value)) : this.node().textContent;
  }
  function htmlRemove() {
    this.innerHTML = "";
  }
  function htmlConstant(value) {
    return function() {
      this.innerHTML = value;
    };
  }
  function htmlFunction(value) {
    return function() {
      var v = value.apply(this, arguments);
      this.innerHTML = v == null ? "" : v;
    };
  }
  function selection_html(value) {
    return arguments.length ? this.each(value == null ? htmlRemove : (typeof value === "function" ? htmlFunction : htmlConstant)(value)) : this.node().innerHTML;
  }
  function raise() {
    if (this.nextSibling)
      this.parentNode.appendChild(this);
  }
  function selection_raise() {
    return this.each(raise);
  }
  function lower() {
    if (this.previousSibling)
      this.parentNode.insertBefore(this, this.parentNode.firstChild);
  }
  function selection_lower() {
    return this.each(lower);
  }
  function selection_append(name) {
    var create2 = typeof name === "function" ? name : creator(name);
    return this.select(function() {
      return this.appendChild(create2.apply(this, arguments));
    });
  }
  function constantNull() {
    return null;
  }
  function selection_insert(name, before) {
    var create2 = typeof name === "function" ? name : creator(name), select2 = before == null ? constantNull : typeof before === "function" ? before : selector(before);
    return this.select(function() {
      return this.insertBefore(create2.apply(this, arguments), select2.apply(this, arguments) || null);
    });
  }
  function remove() {
    var parent = this.parentNode;
    if (parent)
      parent.removeChild(this);
  }
  function selection_remove() {
    return this.each(remove);
  }
  function selection_cloneShallow() {
    var clone = this.cloneNode(false), parent = this.parentNode;
    return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
  }
  function selection_cloneDeep() {
    var clone = this.cloneNode(true), parent = this.parentNode;
    return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
  }
  function selection_clone(deep) {
    return this.select(deep ? selection_cloneDeep : selection_cloneShallow);
  }
  function selection_datum(value) {
    return arguments.length ? this.property("__data__", value) : this.node().__data__;
  }
  function contextListener(listener) {
    return function(event) {
      listener.call(this, event, this.__data__);
    };
  }
  function parseTypenames(typenames) {
    return typenames.trim().split(/^|\s+/).map(function(t) {
      var name = "", i = t.indexOf(".");
      if (i >= 0)
        name = t.slice(i + 1), t = t.slice(0, i);
      return { type: t, name };
    });
  }
  function onRemove(typename) {
    return function() {
      var on = this.__on;
      if (!on)
        return;
      for (var j = 0, i = -1, m = on.length, o; j < m; ++j) {
        if (o = on[j], (!typename.type || o.type === typename.type) && o.name === typename.name) {
          this.removeEventListener(o.type, o.listener, o.options);
        } else {
          on[++i] = o;
        }
      }
      if (++i)
        on.length = i;
      else
        delete this.__on;
    };
  }
  function onAdd(typename, value, options) {
    return function() {
      var on = this.__on, o, listener = contextListener(value);
      if (on)
        for (var j = 0, m = on.length; j < m; ++j) {
          if ((o = on[j]).type === typename.type && o.name === typename.name) {
            this.removeEventListener(o.type, o.listener, o.options);
            this.addEventListener(o.type, o.listener = listener, o.options = options);
            o.value = value;
            return;
          }
        }
      this.addEventListener(typename.type, listener, options);
      o = { type: typename.type, name: typename.name, value, listener, options };
      if (!on)
        this.__on = [o];
      else
        on.push(o);
    };
  }
  function selection_on(typename, value, options) {
    var typenames = parseTypenames(typename + ""), i, n = typenames.length, t;
    if (arguments.length < 2) {
      var on = this.node().__on;
      if (on)
        for (var j = 0, m = on.length, o; j < m; ++j) {
          for (i = 0, o = on[j]; i < n; ++i) {
            if ((t = typenames[i]).type === o.type && t.name === o.name) {
              return o.value;
            }
          }
        }
      return;
    }
    on = value ? onAdd : onRemove;
    for (i = 0; i < n; ++i)
      this.each(on(typenames[i], value, options));
    return this;
  }
  function dispatchEvent(node, type, params) {
    var window2 = defaultView(node), event = window2.CustomEvent;
    if (typeof event === "function") {
      event = new event(type, params);
    } else {
      event = window2.document.createEvent("Event");
      if (params)
        event.initEvent(type, params.bubbles, params.cancelable), event.detail = params.detail;
      else
        event.initEvent(type, false, false);
    }
    node.dispatchEvent(event);
  }
  function dispatchConstant(type, params) {
    return function() {
      return dispatchEvent(this, type, params);
    };
  }
  function dispatchFunction(type, params) {
    return function() {
      return dispatchEvent(this, type, params.apply(this, arguments));
    };
  }
  function selection_dispatch(type, params) {
    return this.each((typeof params === "function" ? dispatchFunction : dispatchConstant)(type, params));
  }
  function* selection_iterator() {
    for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
      for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i) {
        if (node = group[i])
          yield node;
      }
    }
  }
  var root = [null];
  function Selection$1(groups, parents) {
    this._groups = groups;
    this._parents = parents;
  }
  function selection() {
    return new Selection$1([[document.documentElement]], root);
  }
  function selection_selection() {
    return this;
  }
  Selection$1.prototype = selection.prototype = {
    constructor: Selection$1,
    select: selection_select,
    selectAll: selection_selectAll,
    selectChild: selection_selectChild,
    selectChildren: selection_selectChildren,
    filter: selection_filter,
    data: selection_data,
    enter: selection_enter,
    exit: selection_exit,
    join: selection_join,
    merge: selection_merge,
    selection: selection_selection,
    order: selection_order,
    sort: selection_sort,
    call: selection_call,
    nodes: selection_nodes,
    node: selection_node,
    size: selection_size,
    empty: selection_empty,
    each: selection_each,
    attr: selection_attr,
    style: selection_style,
    property: selection_property,
    classed: selection_classed,
    text: selection_text,
    html: selection_html,
    raise: selection_raise,
    lower: selection_lower,
    append: selection_append,
    insert: selection_insert,
    remove: selection_remove,
    clone: selection_clone,
    datum: selection_datum,
    on: selection_on,
    dispatch: selection_dispatch,
    [Symbol.iterator]: selection_iterator
  };
  function select(selector2) {
    return typeof selector2 === "string" ? new Selection$1([[document.querySelector(selector2)]], [document.documentElement]) : new Selection$1([[selector2]], root);
  }
  function sourceEvent(event) {
    let sourceEvent2;
    while (sourceEvent2 = event.sourceEvent)
      event = sourceEvent2;
    return event;
  }
  function pointer(event, node) {
    event = sourceEvent(event);
    if (node === void 0)
      node = event.currentTarget;
    if (node) {
      var svg = node.ownerSVGElement || node;
      if (svg.createSVGPoint) {
        var point = svg.createSVGPoint();
        point.x = event.clientX, point.y = event.clientY;
        point = point.matrixTransform(node.getScreenCTM().inverse());
        return [point.x, point.y];
      }
      if (node.getBoundingClientRect) {
        var rect = node.getBoundingClientRect();
        return [event.clientX - rect.left - node.clientLeft, event.clientY - rect.top - node.clientTop];
      }
    }
    return [event.pageX, event.pageY];
  }
  const nonpassive = { passive: false };
  const nonpassivecapture = { capture: true, passive: false };
  function nopropagation$1(event) {
    event.stopImmediatePropagation();
  }
  function noevent$1(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function dragDisable(view) {
    var root2 = view.document.documentElement, selection2 = select(view).on("dragstart.drag", noevent$1, nonpassivecapture);
    if ("onselectstart" in root2) {
      selection2.on("selectstart.drag", noevent$1, nonpassivecapture);
    } else {
      root2.__noselect = root2.style.MozUserSelect;
      root2.style.MozUserSelect = "none";
    }
  }
  function yesdrag(view, noclick) {
    var root2 = view.document.documentElement, selection2 = select(view).on("dragstart.drag", null);
    if (noclick) {
      selection2.on("click.drag", noevent$1, nonpassivecapture);
      setTimeout(function() {
        selection2.on("click.drag", null);
      }, 0);
    }
    if ("onselectstart" in root2) {
      selection2.on("selectstart.drag", null);
    } else {
      root2.style.MozUserSelect = root2.__noselect;
      delete root2.__noselect;
    }
  }
  const constant$2 = (x) => () => x;
  function DragEvent(type, {
    sourceEvent: sourceEvent2,
    subject,
    target,
    identifier,
    active,
    x,
    y,
    dx,
    dy,
    dispatch: dispatch2
  }) {
    Object.defineProperties(this, {
      type: { value: type, enumerable: true, configurable: true },
      sourceEvent: { value: sourceEvent2, enumerable: true, configurable: true },
      subject: { value: subject, enumerable: true, configurable: true },
      target: { value: target, enumerable: true, configurable: true },
      identifier: { value: identifier, enumerable: true, configurable: true },
      active: { value: active, enumerable: true, configurable: true },
      x: { value: x, enumerable: true, configurable: true },
      y: { value: y, enumerable: true, configurable: true },
      dx: { value: dx, enumerable: true, configurable: true },
      dy: { value: dy, enumerable: true, configurable: true },
      _: { value: dispatch2 }
    });
  }
  DragEvent.prototype.on = function() {
    var value = this._.on.apply(this._, arguments);
    return value === this._ ? this : value;
  };
  function defaultFilter$1(event) {
    return !event.ctrlKey && !event.button;
  }
  function defaultContainer() {
    return this.parentNode;
  }
  function defaultSubject(event, d) {
    return d == null ? { x: event.x, y: event.y } : d;
  }
  function defaultTouchable$1() {
    return navigator.maxTouchPoints || "ontouchstart" in this;
  }
  function drag() {
    var filter2 = defaultFilter$1, container = defaultContainer, subject = defaultSubject, touchable = defaultTouchable$1, gestures = {}, listeners = dispatch("start", "drag", "end"), active = 0, mousedownx, mousedowny, mousemoving, touchending, clickDistance2 = 0;
    function drag2(selection2) {
      selection2.on("mousedown.drag", mousedowned).filter(touchable).on("touchstart.drag", touchstarted).on("touchmove.drag", touchmoved, nonpassive).on("touchend.drag touchcancel.drag", touchended).style("touch-action", "none").style("-webkit-tap-highlight-color", "rgba(0,0,0,0)");
    }
    function mousedowned(event, d) {
      if (touchending || !filter2.call(this, event, d))
        return;
      var gesture = beforestart(this, container.call(this, event, d), event, d, "mouse");
      if (!gesture)
        return;
      select(event.view).on("mousemove.drag", mousemoved, nonpassivecapture).on("mouseup.drag", mouseupped, nonpassivecapture);
      dragDisable(event.view);
      nopropagation$1(event);
      mousemoving = false;
      mousedownx = event.clientX;
      mousedowny = event.clientY;
      gesture("start", event);
    }
    function mousemoved(event) {
      noevent$1(event);
      if (!mousemoving) {
        var dx = event.clientX - mousedownx, dy = event.clientY - mousedowny;
        mousemoving = dx * dx + dy * dy > clickDistance2;
      }
      gestures.mouse("drag", event);
    }
    function mouseupped(event) {
      select(event.view).on("mousemove.drag mouseup.drag", null);
      yesdrag(event.view, mousemoving);
      noevent$1(event);
      gestures.mouse("end", event);
    }
    function touchstarted(event, d) {
      if (!filter2.call(this, event, d))
        return;
      var touches = event.changedTouches, c = container.call(this, event, d), n = touches.length, i, gesture;
      for (i = 0; i < n; ++i) {
        if (gesture = beforestart(this, c, event, d, touches[i].identifier, touches[i])) {
          nopropagation$1(event);
          gesture("start", event, touches[i]);
        }
      }
    }
    function touchmoved(event) {
      var touches = event.changedTouches, n = touches.length, i, gesture;
      for (i = 0; i < n; ++i) {
        if (gesture = gestures[touches[i].identifier]) {
          noevent$1(event);
          gesture("drag", event, touches[i]);
        }
      }
    }
    function touchended(event) {
      var touches = event.changedTouches, n = touches.length, i, gesture;
      if (touchending)
        clearTimeout(touchending);
      touchending = setTimeout(function() {
        touchending = null;
      }, 500);
      for (i = 0; i < n; ++i) {
        if (gesture = gestures[touches[i].identifier]) {
          nopropagation$1(event);
          gesture("end", event, touches[i]);
        }
      }
    }
    function beforestart(that, container2, event, d, identifier, touch) {
      var dispatch2 = listeners.copy(), p = pointer(touch || event, container2), dx, dy, s;
      if ((s = subject.call(that, new DragEvent("beforestart", {
        sourceEvent: event,
        target: drag2,
        identifier,
        active,
        x: p[0],
        y: p[1],
        dx: 0,
        dy: 0,
        dispatch: dispatch2
      }), d)) == null)
        return;
      dx = s.x - p[0] || 0;
      dy = s.y - p[1] || 0;
      return function gesture(type, event2, touch2) {
        var p0 = p, n;
        switch (type) {
          case "start":
            gestures[identifier] = gesture, n = active++;
            break;
          case "end":
            delete gestures[identifier], --active;
          case "drag":
            p = pointer(touch2 || event2, container2), n = active;
            break;
        }
        dispatch2.call(
          type,
          that,
          new DragEvent(type, {
            sourceEvent: event2,
            subject: s,
            target: drag2,
            identifier,
            active: n,
            x: p[0] + dx,
            y: p[1] + dy,
            dx: p[0] - p0[0],
            dy: p[1] - p0[1],
            dispatch: dispatch2
          }),
          d
        );
      };
    }
    drag2.filter = function(_) {
      return arguments.length ? (filter2 = typeof _ === "function" ? _ : constant$2(!!_), drag2) : filter2;
    };
    drag2.container = function(_) {
      return arguments.length ? (container = typeof _ === "function" ? _ : constant$2(_), drag2) : container;
    };
    drag2.subject = function(_) {
      return arguments.length ? (subject = typeof _ === "function" ? _ : constant$2(_), drag2) : subject;
    };
    drag2.touchable = function(_) {
      return arguments.length ? (touchable = typeof _ === "function" ? _ : constant$2(!!_), drag2) : touchable;
    };
    drag2.on = function() {
      var value = listeners.on.apply(listeners, arguments);
      return value === listeners ? drag2 : value;
    };
    drag2.clickDistance = function(_) {
      return arguments.length ? (clickDistance2 = (_ = +_) * _, drag2) : Math.sqrt(clickDistance2);
    };
    return drag2;
  }
  function define(constructor, factory, prototype) {
    constructor.prototype = factory.prototype = prototype;
    prototype.constructor = constructor;
  }
  function extend(parent, definition) {
    var prototype = Object.create(parent.prototype);
    for (var key in definition)
      prototype[key] = definition[key];
    return prototype;
  }
  function Color() {
  }
  var darker = 0.7;
  var brighter = 1 / darker;
  var reI = "\\s*([+-]?\\d+)\\s*", reN = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)\\s*", reP = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)%\\s*", reHex = /^#([0-9a-f]{3,8})$/, reRgbInteger = new RegExp(`^rgb\\(${reI},${reI},${reI}\\)$`), reRgbPercent = new RegExp(`^rgb\\(${reP},${reP},${reP}\\)$`), reRgbaInteger = new RegExp(`^rgba\\(${reI},${reI},${reI},${reN}\\)$`), reRgbaPercent = new RegExp(`^rgba\\(${reP},${reP},${reP},${reN}\\)$`), reHslPercent = new RegExp(`^hsl\\(${reN},${reP},${reP}\\)$`), reHslaPercent = new RegExp(`^hsla\\(${reN},${reP},${reP},${reN}\\)$`);
  var named = {
    aliceblue: 15792383,
    antiquewhite: 16444375,
    aqua: 65535,
    aquamarine: 8388564,
    azure: 15794175,
    beige: 16119260,
    bisque: 16770244,
    black: 0,
    blanchedalmond: 16772045,
    blue: 255,
    blueviolet: 9055202,
    brown: 10824234,
    burlywood: 14596231,
    cadetblue: 6266528,
    chartreuse: 8388352,
    chocolate: 13789470,
    coral: 16744272,
    cornflowerblue: 6591981,
    cornsilk: 16775388,
    crimson: 14423100,
    cyan: 65535,
    darkblue: 139,
    darkcyan: 35723,
    darkgoldenrod: 12092939,
    darkgray: 11119017,
    darkgreen: 25600,
    darkgrey: 11119017,
    darkkhaki: 12433259,
    darkmagenta: 9109643,
    darkolivegreen: 5597999,
    darkorange: 16747520,
    darkorchid: 10040012,
    darkred: 9109504,
    darksalmon: 15308410,
    darkseagreen: 9419919,
    darkslateblue: 4734347,
    darkslategray: 3100495,
    darkslategrey: 3100495,
    darkturquoise: 52945,
    darkviolet: 9699539,
    deeppink: 16716947,
    deepskyblue: 49151,
    dimgray: 6908265,
    dimgrey: 6908265,
    dodgerblue: 2003199,
    firebrick: 11674146,
    floralwhite: 16775920,
    forestgreen: 2263842,
    fuchsia: 16711935,
    gainsboro: 14474460,
    ghostwhite: 16316671,
    gold: 16766720,
    goldenrod: 14329120,
    gray: 8421504,
    green: 32768,
    greenyellow: 11403055,
    grey: 8421504,
    honeydew: 15794160,
    hotpink: 16738740,
    indianred: 13458524,
    indigo: 4915330,
    ivory: 16777200,
    khaki: 15787660,
    lavender: 15132410,
    lavenderblush: 16773365,
    lawngreen: 8190976,
    lemonchiffon: 16775885,
    lightblue: 11393254,
    lightcoral: 15761536,
    lightcyan: 14745599,
    lightgoldenrodyellow: 16448210,
    lightgray: 13882323,
    lightgreen: 9498256,
    lightgrey: 13882323,
    lightpink: 16758465,
    lightsalmon: 16752762,
    lightseagreen: 2142890,
    lightskyblue: 8900346,
    lightslategray: 7833753,
    lightslategrey: 7833753,
    lightsteelblue: 11584734,
    lightyellow: 16777184,
    lime: 65280,
    limegreen: 3329330,
    linen: 16445670,
    magenta: 16711935,
    maroon: 8388608,
    mediumaquamarine: 6737322,
    mediumblue: 205,
    mediumorchid: 12211667,
    mediumpurple: 9662683,
    mediumseagreen: 3978097,
    mediumslateblue: 8087790,
    mediumspringgreen: 64154,
    mediumturquoise: 4772300,
    mediumvioletred: 13047173,
    midnightblue: 1644912,
    mintcream: 16121850,
    mistyrose: 16770273,
    moccasin: 16770229,
    navajowhite: 16768685,
    navy: 128,
    oldlace: 16643558,
    olive: 8421376,
    olivedrab: 7048739,
    orange: 16753920,
    orangered: 16729344,
    orchid: 14315734,
    palegoldenrod: 15657130,
    palegreen: 10025880,
    paleturquoise: 11529966,
    palevioletred: 14381203,
    papayawhip: 16773077,
    peachpuff: 16767673,
    peru: 13468991,
    pink: 16761035,
    plum: 14524637,
    powderblue: 11591910,
    purple: 8388736,
    rebeccapurple: 6697881,
    red: 16711680,
    rosybrown: 12357519,
    royalblue: 4286945,
    saddlebrown: 9127187,
    salmon: 16416882,
    sandybrown: 16032864,
    seagreen: 3050327,
    seashell: 16774638,
    sienna: 10506797,
    silver: 12632256,
    skyblue: 8900331,
    slateblue: 6970061,
    slategray: 7372944,
    slategrey: 7372944,
    snow: 16775930,
    springgreen: 65407,
    steelblue: 4620980,
    tan: 13808780,
    teal: 32896,
    thistle: 14204888,
    tomato: 16737095,
    turquoise: 4251856,
    violet: 15631086,
    wheat: 16113331,
    white: 16777215,
    whitesmoke: 16119285,
    yellow: 16776960,
    yellowgreen: 10145074
  };
  define(Color, color, {
    copy(channels) {
      return Object.assign(new this.constructor(), this, channels);
    },
    displayable() {
      return this.rgb().displayable();
    },
    hex: color_formatHex,
    // Deprecated! Use color.formatHex.
    formatHex: color_formatHex,
    formatHex8: color_formatHex8,
    formatHsl: color_formatHsl,
    formatRgb: color_formatRgb,
    toString: color_formatRgb
  });
  function color_formatHex() {
    return this.rgb().formatHex();
  }
  function color_formatHex8() {
    return this.rgb().formatHex8();
  }
  function color_formatHsl() {
    return hslConvert(this).formatHsl();
  }
  function color_formatRgb() {
    return this.rgb().formatRgb();
  }
  function color(format) {
    var m, l;
    format = (format + "").trim().toLowerCase();
    return (m = reHex.exec(format)) ? (l = m[1].length, m = parseInt(m[1], 16), l === 6 ? rgbn(m) : l === 3 ? new Rgb(m >> 8 & 15 | m >> 4 & 240, m >> 4 & 15 | m & 240, (m & 15) << 4 | m & 15, 1) : l === 8 ? rgba(m >> 24 & 255, m >> 16 & 255, m >> 8 & 255, (m & 255) / 255) : l === 4 ? rgba(m >> 12 & 15 | m >> 8 & 240, m >> 8 & 15 | m >> 4 & 240, m >> 4 & 15 | m & 240, ((m & 15) << 4 | m & 15) / 255) : null) : (m = reRgbInteger.exec(format)) ? new Rgb(m[1], m[2], m[3], 1) : (m = reRgbPercent.exec(format)) ? new Rgb(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, 1) : (m = reRgbaInteger.exec(format)) ? rgba(m[1], m[2], m[3], m[4]) : (m = reRgbaPercent.exec(format)) ? rgba(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, m[4]) : (m = reHslPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, 1) : (m = reHslaPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, m[4]) : named.hasOwnProperty(format) ? rgbn(named[format]) : format === "transparent" ? new Rgb(NaN, NaN, NaN, 0) : null;
  }
  function rgbn(n) {
    return new Rgb(n >> 16 & 255, n >> 8 & 255, n & 255, 1);
  }
  function rgba(r, g, b, a) {
    if (a <= 0)
      r = g = b = NaN;
    return new Rgb(r, g, b, a);
  }
  function rgbConvert(o) {
    if (!(o instanceof Color))
      o = color(o);
    if (!o)
      return new Rgb();
    o = o.rgb();
    return new Rgb(o.r, o.g, o.b, o.opacity);
  }
  function rgb(r, g, b, opacity) {
    return arguments.length === 1 ? rgbConvert(r) : new Rgb(r, g, b, opacity == null ? 1 : opacity);
  }
  function Rgb(r, g, b, opacity) {
    this.r = +r;
    this.g = +g;
    this.b = +b;
    this.opacity = +opacity;
  }
  define(Rgb, rgb, extend(Color, {
    brighter(k) {
      k = k == null ? brighter : Math.pow(brighter, k);
      return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
    },
    darker(k) {
      k = k == null ? darker : Math.pow(darker, k);
      return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
    },
    rgb() {
      return this;
    },
    clamp() {
      return new Rgb(clampi(this.r), clampi(this.g), clampi(this.b), clampa(this.opacity));
    },
    displayable() {
      return -0.5 <= this.r && this.r < 255.5 && (-0.5 <= this.g && this.g < 255.5) && (-0.5 <= this.b && this.b < 255.5) && (0 <= this.opacity && this.opacity <= 1);
    },
    hex: rgb_formatHex,
    // Deprecated! Use color.formatHex.
    formatHex: rgb_formatHex,
    formatHex8: rgb_formatHex8,
    formatRgb: rgb_formatRgb,
    toString: rgb_formatRgb
  }));
  function rgb_formatHex() {
    return `#${hex(this.r)}${hex(this.g)}${hex(this.b)}`;
  }
  function rgb_formatHex8() {
    return `#${hex(this.r)}${hex(this.g)}${hex(this.b)}${hex((isNaN(this.opacity) ? 1 : this.opacity) * 255)}`;
  }
  function rgb_formatRgb() {
    const a = clampa(this.opacity);
    return `${a === 1 ? "rgb(" : "rgba("}${clampi(this.r)}, ${clampi(this.g)}, ${clampi(this.b)}${a === 1 ? ")" : `, ${a})`}`;
  }
  function clampa(opacity) {
    return isNaN(opacity) ? 1 : Math.max(0, Math.min(1, opacity));
  }
  function clampi(value) {
    return Math.max(0, Math.min(255, Math.round(value) || 0));
  }
  function hex(value) {
    value = clampi(value);
    return (value < 16 ? "0" : "") + value.toString(16);
  }
  function hsla(h, s, l, a) {
    if (a <= 0)
      h = s = l = NaN;
    else if (l <= 0 || l >= 1)
      h = s = NaN;
    else if (s <= 0)
      h = NaN;
    return new Hsl(h, s, l, a);
  }
  function hslConvert(o) {
    if (o instanceof Hsl)
      return new Hsl(o.h, o.s, o.l, o.opacity);
    if (!(o instanceof Color))
      o = color(o);
    if (!o)
      return new Hsl();
    if (o instanceof Hsl)
      return o;
    o = o.rgb();
    var r = o.r / 255, g = o.g / 255, b = o.b / 255, min = Math.min(r, g, b), max = Math.max(r, g, b), h = NaN, s = max - min, l = (max + min) / 2;
    if (s) {
      if (r === max)
        h = (g - b) / s + (g < b) * 6;
      else if (g === max)
        h = (b - r) / s + 2;
      else
        h = (r - g) / s + 4;
      s /= l < 0.5 ? max + min : 2 - max - min;
      h *= 60;
    } else {
      s = l > 0 && l < 1 ? 0 : h;
    }
    return new Hsl(h, s, l, o.opacity);
  }
  function hsl(h, s, l, opacity) {
    return arguments.length === 1 ? hslConvert(h) : new Hsl(h, s, l, opacity == null ? 1 : opacity);
  }
  function Hsl(h, s, l, opacity) {
    this.h = +h;
    this.s = +s;
    this.l = +l;
    this.opacity = +opacity;
  }
  define(Hsl, hsl, extend(Color, {
    brighter(k) {
      k = k == null ? brighter : Math.pow(brighter, k);
      return new Hsl(this.h, this.s, this.l * k, this.opacity);
    },
    darker(k) {
      k = k == null ? darker : Math.pow(darker, k);
      return new Hsl(this.h, this.s, this.l * k, this.opacity);
    },
    rgb() {
      var h = this.h % 360 + (this.h < 0) * 360, s = isNaN(h) || isNaN(this.s) ? 0 : this.s, l = this.l, m2 = l + (l < 0.5 ? l : 1 - l) * s, m1 = 2 * l - m2;
      return new Rgb(
        hsl2rgb(h >= 240 ? h - 240 : h + 120, m1, m2),
        hsl2rgb(h, m1, m2),
        hsl2rgb(h < 120 ? h + 240 : h - 120, m1, m2),
        this.opacity
      );
    },
    clamp() {
      return new Hsl(clamph(this.h), clampt(this.s), clampt(this.l), clampa(this.opacity));
    },
    displayable() {
      return (0 <= this.s && this.s <= 1 || isNaN(this.s)) && (0 <= this.l && this.l <= 1) && (0 <= this.opacity && this.opacity <= 1);
    },
    formatHsl() {
      const a = clampa(this.opacity);
      return `${a === 1 ? "hsl(" : "hsla("}${clamph(this.h)}, ${clampt(this.s) * 100}%, ${clampt(this.l) * 100}%${a === 1 ? ")" : `, ${a})`}`;
    }
  }));
  function clamph(value) {
    value = (value || 0) % 360;
    return value < 0 ? value + 360 : value;
  }
  function clampt(value) {
    return Math.max(0, Math.min(1, value || 0));
  }
  function hsl2rgb(h, m1, m2) {
    return (h < 60 ? m1 + (m2 - m1) * h / 60 : h < 180 ? m2 : h < 240 ? m1 + (m2 - m1) * (240 - h) / 60 : m1) * 255;
  }
  const constant$1 = (x) => () => x;
  function linear(a, d) {
    return function(t) {
      return a + t * d;
    };
  }
  function exponential(a, b, y) {
    return a = Math.pow(a, y), b = Math.pow(b, y) - a, y = 1 / y, function(t) {
      return Math.pow(a + t * b, y);
    };
  }
  function gamma(y) {
    return (y = +y) === 1 ? nogamma : function(a, b) {
      return b - a ? exponential(a, b, y) : constant$1(isNaN(a) ? b : a);
    };
  }
  function nogamma(a, b) {
    var d = b - a;
    return d ? linear(a, d) : constant$1(isNaN(a) ? b : a);
  }
  const interpolateRgb = function rgbGamma(y) {
    var color2 = gamma(y);
    function rgb$1(start2, end) {
      var r = color2((start2 = rgb(start2)).r, (end = rgb(end)).r), g = color2(start2.g, end.g), b = color2(start2.b, end.b), opacity = nogamma(start2.opacity, end.opacity);
      return function(t) {
        start2.r = r(t);
        start2.g = g(t);
        start2.b = b(t);
        start2.opacity = opacity(t);
        return start2 + "";
      };
    }
    rgb$1.gamma = rgbGamma;
    return rgb$1;
  }(1);
  function interpolateNumber(a, b) {
    return a = +a, b = +b, function(t) {
      return a * (1 - t) + b * t;
    };
  }
  var reA = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g, reB = new RegExp(reA.source, "g");
  function zero(b) {
    return function() {
      return b;
    };
  }
  function one(b) {
    return function(t) {
      return b(t) + "";
    };
  }
  function interpolateString(a, b) {
    var bi = reA.lastIndex = reB.lastIndex = 0, am, bm, bs, i = -1, s = [], q = [];
    a = a + "", b = b + "";
    while ((am = reA.exec(a)) && (bm = reB.exec(b))) {
      if ((bs = bm.index) > bi) {
        bs = b.slice(bi, bs);
        if (s[i])
          s[i] += bs;
        else
          s[++i] = bs;
      }
      if ((am = am[0]) === (bm = bm[0])) {
        if (s[i])
          s[i] += bm;
        else
          s[++i] = bm;
      } else {
        s[++i] = null;
        q.push({ i, x: interpolateNumber(am, bm) });
      }
      bi = reB.lastIndex;
    }
    if (bi < b.length) {
      bs = b.slice(bi);
      if (s[i])
        s[i] += bs;
      else
        s[++i] = bs;
    }
    return s.length < 2 ? q[0] ? one(q[0].x) : zero(b) : (b = q.length, function(t) {
      for (var i2 = 0, o; i2 < b; ++i2)
        s[(o = q[i2]).i] = o.x(t);
      return s.join("");
    });
  }
  var degrees = 180 / Math.PI;
  var identity$1 = {
    translateX: 0,
    translateY: 0,
    rotate: 0,
    skewX: 0,
    scaleX: 1,
    scaleY: 1
  };
  function decompose(a, b, c, d, e, f) {
    var scaleX, scaleY, skewX;
    if (scaleX = Math.sqrt(a * a + b * b))
      a /= scaleX, b /= scaleX;
    if (skewX = a * c + b * d)
      c -= a * skewX, d -= b * skewX;
    if (scaleY = Math.sqrt(c * c + d * d))
      c /= scaleY, d /= scaleY, skewX /= scaleY;
    if (a * d < b * c)
      a = -a, b = -b, skewX = -skewX, scaleX = -scaleX;
    return {
      translateX: e,
      translateY: f,
      rotate: Math.atan2(b, a) * degrees,
      skewX: Math.atan(skewX) * degrees,
      scaleX,
      scaleY
    };
  }
  var svgNode;
  function parseCss(value) {
    const m = new (typeof DOMMatrix === "function" ? DOMMatrix : WebKitCSSMatrix)(value + "");
    return m.isIdentity ? identity$1 : decompose(m.a, m.b, m.c, m.d, m.e, m.f);
  }
  function parseSvg(value) {
    if (value == null)
      return identity$1;
    if (!svgNode)
      svgNode = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svgNode.setAttribute("transform", value);
    if (!(value = svgNode.transform.baseVal.consolidate()))
      return identity$1;
    value = value.matrix;
    return decompose(value.a, value.b, value.c, value.d, value.e, value.f);
  }
  function interpolateTransform(parse, pxComma, pxParen, degParen) {
    function pop(s) {
      return s.length ? s.pop() + " " : "";
    }
    function translate(xa, ya, xb, yb, s, q) {
      if (xa !== xb || ya !== yb) {
        var i = s.push("translate(", null, pxComma, null, pxParen);
        q.push({ i: i - 4, x: interpolateNumber(xa, xb) }, { i: i - 2, x: interpolateNumber(ya, yb) });
      } else if (xb || yb) {
        s.push("translate(" + xb + pxComma + yb + pxParen);
      }
    }
    function rotate(a, b, s, q) {
      if (a !== b) {
        if (a - b > 180)
          b += 360;
        else if (b - a > 180)
          a += 360;
        q.push({ i: s.push(pop(s) + "rotate(", null, degParen) - 2, x: interpolateNumber(a, b) });
      } else if (b) {
        s.push(pop(s) + "rotate(" + b + degParen);
      }
    }
    function skewX(a, b, s, q) {
      if (a !== b) {
        q.push({ i: s.push(pop(s) + "skewX(", null, degParen) - 2, x: interpolateNumber(a, b) });
      } else if (b) {
        s.push(pop(s) + "skewX(" + b + degParen);
      }
    }
    function scale(xa, ya, xb, yb, s, q) {
      if (xa !== xb || ya !== yb) {
        var i = s.push(pop(s) + "scale(", null, ",", null, ")");
        q.push({ i: i - 4, x: interpolateNumber(xa, xb) }, { i: i - 2, x: interpolateNumber(ya, yb) });
      } else if (xb !== 1 || yb !== 1) {
        s.push(pop(s) + "scale(" + xb + "," + yb + ")");
      }
    }
    return function(a, b) {
      var s = [], q = [];
      a = parse(a), b = parse(b);
      translate(a.translateX, a.translateY, b.translateX, b.translateY, s, q);
      rotate(a.rotate, b.rotate, s, q);
      skewX(a.skewX, b.skewX, s, q);
      scale(a.scaleX, a.scaleY, b.scaleX, b.scaleY, s, q);
      a = b = null;
      return function(t) {
        var i = -1, n = q.length, o;
        while (++i < n)
          s[(o = q[i]).i] = o.x(t);
        return s.join("");
      };
    };
  }
  var interpolateTransformCss = interpolateTransform(parseCss, "px, ", "px)", "deg)");
  var interpolateTransformSvg = interpolateTransform(parseSvg, ", ", ")", ")");
  var epsilon2 = 1e-12;
  function cosh(x) {
    return ((x = Math.exp(x)) + 1 / x) / 2;
  }
  function sinh(x) {
    return ((x = Math.exp(x)) - 1 / x) / 2;
  }
  function tanh(x) {
    return ((x = Math.exp(2 * x)) - 1) / (x + 1);
  }
  const interpolateZoom = function zoomRho(rho, rho2, rho4) {
    function zoom2(p0, p1) {
      var ux0 = p0[0], uy0 = p0[1], w0 = p0[2], ux1 = p1[0], uy1 = p1[1], w1 = p1[2], dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy, i, S;
      if (d2 < epsilon2) {
        S = Math.log(w1 / w0) / rho;
        i = function(t) {
          return [
            ux0 + t * dx,
            uy0 + t * dy,
            w0 * Math.exp(rho * t * S)
          ];
        };
      } else {
        var d1 = Math.sqrt(d2), b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1), b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1), r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
        S = (r1 - r0) / rho;
        i = function(t) {
          var s = t * S, coshr0 = cosh(r0), u = w0 / (rho2 * d1) * (coshr0 * tanh(rho * s + r0) - sinh(r0));
          return [
            ux0 + u * dx,
            uy0 + u * dy,
            w0 * coshr0 / cosh(rho * s + r0)
          ];
        };
      }
      i.duration = S * 1e3 * rho / Math.SQRT2;
      return i;
    }
    zoom2.rho = function(_) {
      var _1 = Math.max(1e-3, +_), _2 = _1 * _1, _4 = _2 * _2;
      return zoomRho(_1, _2, _4);
    };
    return zoom2;
  }(Math.SQRT2, 2, 4);
  var frame = 0, timeout$1 = 0, interval = 0, pokeDelay = 1e3, taskHead, taskTail, clockLast = 0, clockNow = 0, clockSkew = 0, clock = typeof performance === "object" && performance.now ? performance : Date, setFrame = typeof window === "object" && window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function(f) {
    setTimeout(f, 17);
  };
  function now() {
    return clockNow || (setFrame(clearNow), clockNow = clock.now() + clockSkew);
  }
  function clearNow() {
    clockNow = 0;
  }
  function Timer() {
    this._call = this._time = this._next = null;
  }
  Timer.prototype = timer.prototype = {
    constructor: Timer,
    restart: function(callback, delay, time) {
      if (typeof callback !== "function")
        throw new TypeError("callback is not a function");
      time = (time == null ? now() : +time) + (delay == null ? 0 : +delay);
      if (!this._next && taskTail !== this) {
        if (taskTail)
          taskTail._next = this;
        else
          taskHead = this;
        taskTail = this;
      }
      this._call = callback;
      this._time = time;
      sleep();
    },
    stop: function() {
      if (this._call) {
        this._call = null;
        this._time = Infinity;
        sleep();
      }
    }
  };
  function timer(callback, delay, time) {
    var t = new Timer();
    t.restart(callback, delay, time);
    return t;
  }
  function timerFlush() {
    now();
    ++frame;
    var t = taskHead, e;
    while (t) {
      if ((e = clockNow - t._time) >= 0)
        t._call.call(void 0, e);
      t = t._next;
    }
    --frame;
  }
  function wake() {
    clockNow = (clockLast = clock.now()) + clockSkew;
    frame = timeout$1 = 0;
    try {
      timerFlush();
    } finally {
      frame = 0;
      nap();
      clockNow = 0;
    }
  }
  function poke() {
    var now2 = clock.now(), delay = now2 - clockLast;
    if (delay > pokeDelay)
      clockSkew -= delay, clockLast = now2;
  }
  function nap() {
    var t0, t1 = taskHead, t2, time = Infinity;
    while (t1) {
      if (t1._call) {
        if (time > t1._time)
          time = t1._time;
        t0 = t1, t1 = t1._next;
      } else {
        t2 = t1._next, t1._next = null;
        t1 = t0 ? t0._next = t2 : taskHead = t2;
      }
    }
    taskTail = t0;
    sleep(time);
  }
  function sleep(time) {
    if (frame)
      return;
    if (timeout$1)
      timeout$1 = clearTimeout(timeout$1);
    var delay = time - clockNow;
    if (delay > 24) {
      if (time < Infinity)
        timeout$1 = setTimeout(wake, time - clock.now() - clockSkew);
      if (interval)
        interval = clearInterval(interval);
    } else {
      if (!interval)
        clockLast = clock.now(), interval = setInterval(poke, pokeDelay);
      frame = 1, setFrame(wake);
    }
  }
  function timeout(callback, delay, time) {
    var t = new Timer();
    delay = delay == null ? 0 : +delay;
    t.restart((elapsed) => {
      t.stop();
      callback(elapsed + delay);
    }, delay, time);
    return t;
  }
  var emptyOn = dispatch("start", "end", "cancel", "interrupt");
  var emptyTween = [];
  var CREATED = 0;
  var SCHEDULED = 1;
  var STARTING = 2;
  var STARTED = 3;
  var RUNNING = 4;
  var ENDING = 5;
  var ENDED = 6;
  function schedule(node, name, id2, index, group, timing) {
    var schedules = node.__transition;
    if (!schedules)
      node.__transition = {};
    else if (id2 in schedules)
      return;
    create(node, id2, {
      name,
      index,
      // For context during callback.
      group,
      // For context during callback.
      on: emptyOn,
      tween: emptyTween,
      time: timing.time,
      delay: timing.delay,
      duration: timing.duration,
      ease: timing.ease,
      timer: null,
      state: CREATED
    });
  }
  function init(node, id2) {
    var schedule2 = get(node, id2);
    if (schedule2.state > CREATED)
      throw new Error("too late; already scheduled");
    return schedule2;
  }
  function set(node, id2) {
    var schedule2 = get(node, id2);
    if (schedule2.state > STARTED)
      throw new Error("too late; already running");
    return schedule2;
  }
  function get(node, id2) {
    var schedule2 = node.__transition;
    if (!schedule2 || !(schedule2 = schedule2[id2]))
      throw new Error("transition not found");
    return schedule2;
  }
  function create(node, id2, self) {
    var schedules = node.__transition, tween;
    schedules[id2] = self;
    self.timer = timer(schedule2, 0, self.time);
    function schedule2(elapsed) {
      self.state = SCHEDULED;
      self.timer.restart(start2, self.delay, self.time);
      if (self.delay <= elapsed)
        start2(elapsed - self.delay);
    }
    function start2(elapsed) {
      var i, j, n, o;
      if (self.state !== SCHEDULED)
        return stop();
      for (i in schedules) {
        o = schedules[i];
        if (o.name !== self.name)
          continue;
        if (o.state === STARTED)
          return timeout(start2);
        if (o.state === RUNNING) {
          o.state = ENDED;
          o.timer.stop();
          o.on.call("interrupt", node, node.__data__, o.index, o.group);
          delete schedules[i];
        } else if (+i < id2) {
          o.state = ENDED;
          o.timer.stop();
          o.on.call("cancel", node, node.__data__, o.index, o.group);
          delete schedules[i];
        }
      }
      timeout(function() {
        if (self.state === STARTED) {
          self.state = RUNNING;
          self.timer.restart(tick, self.delay, self.time);
          tick(elapsed);
        }
      });
      self.state = STARTING;
      self.on.call("start", node, node.__data__, self.index, self.group);
      if (self.state !== STARTING)
        return;
      self.state = STARTED;
      tween = new Array(n = self.tween.length);
      for (i = 0, j = -1; i < n; ++i) {
        if (o = self.tween[i].value.call(node, node.__data__, self.index, self.group)) {
          tween[++j] = o;
        }
      }
      tween.length = j + 1;
    }
    function tick(elapsed) {
      var t = elapsed < self.duration ? self.ease.call(null, elapsed / self.duration) : (self.timer.restart(stop), self.state = ENDING, 1), i = -1, n = tween.length;
      while (++i < n) {
        tween[i].call(node, t);
      }
      if (self.state === ENDING) {
        self.on.call("end", node, node.__data__, self.index, self.group);
        stop();
      }
    }
    function stop() {
      self.state = ENDED;
      self.timer.stop();
      delete schedules[id2];
      for (var i in schedules)
        return;
      delete node.__transition;
    }
  }
  function interrupt(node, name) {
    var schedules = node.__transition, schedule2, active, empty2 = true, i;
    if (!schedules)
      return;
    name = name == null ? null : name + "";
    for (i in schedules) {
      if ((schedule2 = schedules[i]).name !== name) {
        empty2 = false;
        continue;
      }
      active = schedule2.state > STARTING && schedule2.state < ENDING;
      schedule2.state = ENDED;
      schedule2.timer.stop();
      schedule2.on.call(active ? "interrupt" : "cancel", node, node.__data__, schedule2.index, schedule2.group);
      delete schedules[i];
    }
    if (empty2)
      delete node.__transition;
  }
  function selection_interrupt(name) {
    return this.each(function() {
      interrupt(this, name);
    });
  }
  function tweenRemove(id2, name) {
    var tween0, tween1;
    return function() {
      var schedule2 = set(this, id2), tween = schedule2.tween;
      if (tween !== tween0) {
        tween1 = tween0 = tween;
        for (var i = 0, n = tween1.length; i < n; ++i) {
          if (tween1[i].name === name) {
            tween1 = tween1.slice();
            tween1.splice(i, 1);
            break;
          }
        }
      }
      schedule2.tween = tween1;
    };
  }
  function tweenFunction(id2, name, value) {
    var tween0, tween1;
    if (typeof value !== "function")
      throw new Error();
    return function() {
      var schedule2 = set(this, id2), tween = schedule2.tween;
      if (tween !== tween0) {
        tween1 = (tween0 = tween).slice();
        for (var t = { name, value }, i = 0, n = tween1.length; i < n; ++i) {
          if (tween1[i].name === name) {
            tween1[i] = t;
            break;
          }
        }
        if (i === n)
          tween1.push(t);
      }
      schedule2.tween = tween1;
    };
  }
  function transition_tween(name, value) {
    var id2 = this._id;
    name += "";
    if (arguments.length < 2) {
      var tween = get(this.node(), id2).tween;
      for (var i = 0, n = tween.length, t; i < n; ++i) {
        if ((t = tween[i]).name === name) {
          return t.value;
        }
      }
      return null;
    }
    return this.each((value == null ? tweenRemove : tweenFunction)(id2, name, value));
  }
  function tweenValue(transition2, name, value) {
    var id2 = transition2._id;
    transition2.each(function() {
      var schedule2 = set(this, id2);
      (schedule2.value || (schedule2.value = {}))[name] = value.apply(this, arguments);
    });
    return function(node) {
      return get(node, id2).value[name];
    };
  }
  function interpolate(a, b) {
    var c;
    return (typeof b === "number" ? interpolateNumber : b instanceof color ? interpolateRgb : (c = color(b)) ? (b = c, interpolateRgb) : interpolateString)(a, b);
  }
  function attrRemove(name) {
    return function() {
      this.removeAttribute(name);
    };
  }
  function attrRemoveNS(fullname) {
    return function() {
      this.removeAttributeNS(fullname.space, fullname.local);
    };
  }
  function attrConstant(name, interpolate2, value1) {
    var string00, string1 = value1 + "", interpolate0;
    return function() {
      var string0 = this.getAttribute(name);
      return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate2(string00 = string0, value1);
    };
  }
  function attrConstantNS(fullname, interpolate2, value1) {
    var string00, string1 = value1 + "", interpolate0;
    return function() {
      var string0 = this.getAttributeNS(fullname.space, fullname.local);
      return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate2(string00 = string0, value1);
    };
  }
  function attrFunction(name, interpolate2, value) {
    var string00, string10, interpolate0;
    return function() {
      var string0, value1 = value(this), string1;
      if (value1 == null)
        return void this.removeAttribute(name);
      string0 = this.getAttribute(name);
      string1 = value1 + "";
      return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate2(string00 = string0, value1));
    };
  }
  function attrFunctionNS(fullname, interpolate2, value) {
    var string00, string10, interpolate0;
    return function() {
      var string0, value1 = value(this), string1;
      if (value1 == null)
        return void this.removeAttributeNS(fullname.space, fullname.local);
      string0 = this.getAttributeNS(fullname.space, fullname.local);
      string1 = value1 + "";
      return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate2(string00 = string0, value1));
    };
  }
  function transition_attr(name, value) {
    var fullname = namespace(name), i = fullname === "transform" ? interpolateTransformSvg : interpolate;
    return this.attrTween(name, typeof value === "function" ? (fullname.local ? attrFunctionNS : attrFunction)(fullname, i, tweenValue(this, "attr." + name, value)) : value == null ? (fullname.local ? attrRemoveNS : attrRemove)(fullname) : (fullname.local ? attrConstantNS : attrConstant)(fullname, i, value));
  }
  function attrInterpolate(name, i) {
    return function(t) {
      this.setAttribute(name, i.call(this, t));
    };
  }
  function attrInterpolateNS(fullname, i) {
    return function(t) {
      this.setAttributeNS(fullname.space, fullname.local, i.call(this, t));
    };
  }
  function attrTweenNS(fullname, value) {
    var t0, i0;
    function tween() {
      var i = value.apply(this, arguments);
      if (i !== i0)
        t0 = (i0 = i) && attrInterpolateNS(fullname, i);
      return t0;
    }
    tween._value = value;
    return tween;
  }
  function attrTween(name, value) {
    var t0, i0;
    function tween() {
      var i = value.apply(this, arguments);
      if (i !== i0)
        t0 = (i0 = i) && attrInterpolate(name, i);
      return t0;
    }
    tween._value = value;
    return tween;
  }
  function transition_attrTween(name, value) {
    var key = "attr." + name;
    if (arguments.length < 2)
      return (key = this.tween(key)) && key._value;
    if (value == null)
      return this.tween(key, null);
    if (typeof value !== "function")
      throw new Error();
    var fullname = namespace(name);
    return this.tween(key, (fullname.local ? attrTweenNS : attrTween)(fullname, value));
  }
  function delayFunction(id2, value) {
    return function() {
      init(this, id2).delay = +value.apply(this, arguments);
    };
  }
  function delayConstant(id2, value) {
    return value = +value, function() {
      init(this, id2).delay = value;
    };
  }
  function transition_delay(value) {
    var id2 = this._id;
    return arguments.length ? this.each((typeof value === "function" ? delayFunction : delayConstant)(id2, value)) : get(this.node(), id2).delay;
  }
  function durationFunction(id2, value) {
    return function() {
      set(this, id2).duration = +value.apply(this, arguments);
    };
  }
  function durationConstant(id2, value) {
    return value = +value, function() {
      set(this, id2).duration = value;
    };
  }
  function transition_duration(value) {
    var id2 = this._id;
    return arguments.length ? this.each((typeof value === "function" ? durationFunction : durationConstant)(id2, value)) : get(this.node(), id2).duration;
  }
  function easeConstant(id2, value) {
    if (typeof value !== "function")
      throw new Error();
    return function() {
      set(this, id2).ease = value;
    };
  }
  function transition_ease(value) {
    var id2 = this._id;
    return arguments.length ? this.each(easeConstant(id2, value)) : get(this.node(), id2).ease;
  }
  function easeVarying(id2, value) {
    return function() {
      var v = value.apply(this, arguments);
      if (typeof v !== "function")
        throw new Error();
      set(this, id2).ease = v;
    };
  }
  function transition_easeVarying(value) {
    if (typeof value !== "function")
      throw new Error();
    return this.each(easeVarying(this._id, value));
  }
  function transition_filter(match) {
    if (typeof match !== "function")
      match = matcher(match);
    for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i) {
        if ((node = group[i]) && match.call(node, node.__data__, i, group)) {
          subgroup.push(node);
        }
      }
    }
    return new Transition(subgroups, this._parents, this._name, this._id);
  }
  function transition_merge(transition2) {
    if (transition2._id !== this._id)
      throw new Error();
    for (var groups0 = this._groups, groups1 = transition2._groups, m0 = groups0.length, m1 = groups1.length, m = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m; ++j) {
      for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge = merges[j] = new Array(n), node, i = 0; i < n; ++i) {
        if (node = group0[i] || group1[i]) {
          merge[i] = node;
        }
      }
    }
    for (; j < m0; ++j) {
      merges[j] = groups0[j];
    }
    return new Transition(merges, this._parents, this._name, this._id);
  }
  function start(name) {
    return (name + "").trim().split(/^|\s+/).every(function(t) {
      var i = t.indexOf(".");
      if (i >= 0)
        t = t.slice(0, i);
      return !t || t === "start";
    });
  }
  function onFunction(id2, name, listener) {
    var on0, on1, sit = start(name) ? init : set;
    return function() {
      var schedule2 = sit(this, id2), on = schedule2.on;
      if (on !== on0)
        (on1 = (on0 = on).copy()).on(name, listener);
      schedule2.on = on1;
    };
  }
  function transition_on(name, listener) {
    var id2 = this._id;
    return arguments.length < 2 ? get(this.node(), id2).on.on(name) : this.each(onFunction(id2, name, listener));
  }
  function removeFunction(id2) {
    return function() {
      var parent = this.parentNode;
      for (var i in this.__transition)
        if (+i !== id2)
          return;
      if (parent)
        parent.removeChild(this);
    };
  }
  function transition_remove() {
    return this.on("end.remove", removeFunction(this._id));
  }
  function transition_select(select2) {
    var name = this._name, id2 = this._id;
    if (typeof select2 !== "function")
      select2 = selector(select2);
    for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i) {
        if ((node = group[i]) && (subnode = select2.call(node, node.__data__, i, group))) {
          if ("__data__" in node)
            subnode.__data__ = node.__data__;
          subgroup[i] = subnode;
          schedule(subgroup[i], name, id2, i, subgroup, get(node, id2));
        }
      }
    }
    return new Transition(subgroups, this._parents, name, id2);
  }
  function transition_selectAll(select2) {
    var name = this._name, id2 = this._id;
    if (typeof select2 !== "function")
      select2 = selectorAll(select2);
    for (var groups = this._groups, m = groups.length, subgroups = [], parents = [], j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          for (var children2 = select2.call(node, node.__data__, i, group), child, inherit2 = get(node, id2), k = 0, l = children2.length; k < l; ++k) {
            if (child = children2[k]) {
              schedule(child, name, id2, k, children2, inherit2);
            }
          }
          subgroups.push(children2);
          parents.push(node);
        }
      }
    }
    return new Transition(subgroups, parents, name, id2);
  }
  var Selection = selection.prototype.constructor;
  function transition_selection() {
    return new Selection(this._groups, this._parents);
  }
  function styleNull(name, interpolate2) {
    var string00, string10, interpolate0;
    return function() {
      var string0 = styleValue(this, name), string1 = (this.style.removeProperty(name), styleValue(this, name));
      return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : interpolate0 = interpolate2(string00 = string0, string10 = string1);
    };
  }
  function styleRemove(name) {
    return function() {
      this.style.removeProperty(name);
    };
  }
  function styleConstant(name, interpolate2, value1) {
    var string00, string1 = value1 + "", interpolate0;
    return function() {
      var string0 = styleValue(this, name);
      return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate2(string00 = string0, value1);
    };
  }
  function styleFunction(name, interpolate2, value) {
    var string00, string10, interpolate0;
    return function() {
      var string0 = styleValue(this, name), value1 = value(this), string1 = value1 + "";
      if (value1 == null)
        string1 = value1 = (this.style.removeProperty(name), styleValue(this, name));
      return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate2(string00 = string0, value1));
    };
  }
  function styleMaybeRemove(id2, name) {
    var on0, on1, listener0, key = "style." + name, event = "end." + key, remove2;
    return function() {
      var schedule2 = set(this, id2), on = schedule2.on, listener = schedule2.value[key] == null ? remove2 || (remove2 = styleRemove(name)) : void 0;
      if (on !== on0 || listener0 !== listener)
        (on1 = (on0 = on).copy()).on(event, listener0 = listener);
      schedule2.on = on1;
    };
  }
  function transition_style(name, value, priority) {
    var i = (name += "") === "transform" ? interpolateTransformCss : interpolate;
    return value == null ? this.styleTween(name, styleNull(name, i)).on("end.style." + name, styleRemove(name)) : typeof value === "function" ? this.styleTween(name, styleFunction(name, i, tweenValue(this, "style." + name, value))).each(styleMaybeRemove(this._id, name)) : this.styleTween(name, styleConstant(name, i, value), priority).on("end.style." + name, null);
  }
  function styleInterpolate(name, i, priority) {
    return function(t) {
      this.style.setProperty(name, i.call(this, t), priority);
    };
  }
  function styleTween(name, value, priority) {
    var t, i0;
    function tween() {
      var i = value.apply(this, arguments);
      if (i !== i0)
        t = (i0 = i) && styleInterpolate(name, i, priority);
      return t;
    }
    tween._value = value;
    return tween;
  }
  function transition_styleTween(name, value, priority) {
    var key = "style." + (name += "");
    if (arguments.length < 2)
      return (key = this.tween(key)) && key._value;
    if (value == null)
      return this.tween(key, null);
    if (typeof value !== "function")
      throw new Error();
    return this.tween(key, styleTween(name, value, priority == null ? "" : priority));
  }
  function textConstant(value) {
    return function() {
      this.textContent = value;
    };
  }
  function textFunction(value) {
    return function() {
      var value1 = value(this);
      this.textContent = value1 == null ? "" : value1;
    };
  }
  function transition_text(value) {
    return this.tween("text", typeof value === "function" ? textFunction(tweenValue(this, "text", value)) : textConstant(value == null ? "" : value + ""));
  }
  function textInterpolate(i) {
    return function(t) {
      this.textContent = i.call(this, t);
    };
  }
  function textTween(value) {
    var t0, i0;
    function tween() {
      var i = value.apply(this, arguments);
      if (i !== i0)
        t0 = (i0 = i) && textInterpolate(i);
      return t0;
    }
    tween._value = value;
    return tween;
  }
  function transition_textTween(value) {
    var key = "text";
    if (arguments.length < 1)
      return (key = this.tween(key)) && key._value;
    if (value == null)
      return this.tween(key, null);
    if (typeof value !== "function")
      throw new Error();
    return this.tween(key, textTween(value));
  }
  function transition_transition() {
    var name = this._name, id0 = this._id, id1 = newId();
    for (var groups = this._groups, m = groups.length, j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          var inherit2 = get(node, id0);
          schedule(node, name, id1, i, group, {
            time: inherit2.time + inherit2.delay + inherit2.duration,
            delay: 0,
            duration: inherit2.duration,
            ease: inherit2.ease
          });
        }
      }
    }
    return new Transition(groups, this._parents, name, id1);
  }
  function transition_end() {
    var on0, on1, that = this, id2 = that._id, size = that.size();
    return new Promise(function(resolve, reject) {
      var cancel = { value: reject }, end = { value: function() {
        if (--size === 0)
          resolve();
      } };
      that.each(function() {
        var schedule2 = set(this, id2), on = schedule2.on;
        if (on !== on0) {
          on1 = (on0 = on).copy();
          on1._.cancel.push(cancel);
          on1._.interrupt.push(cancel);
          on1._.end.push(end);
        }
        schedule2.on = on1;
      });
      if (size === 0)
        resolve();
    });
  }
  var id = 0;
  function Transition(groups, parents, name, id2) {
    this._groups = groups;
    this._parents = parents;
    this._name = name;
    this._id = id2;
  }
  function newId() {
    return ++id;
  }
  var selection_prototype = selection.prototype;
  Transition.prototype = {
    constructor: Transition,
    select: transition_select,
    selectAll: transition_selectAll,
    selectChild: selection_prototype.selectChild,
    selectChildren: selection_prototype.selectChildren,
    filter: transition_filter,
    merge: transition_merge,
    selection: transition_selection,
    transition: transition_transition,
    call: selection_prototype.call,
    nodes: selection_prototype.nodes,
    node: selection_prototype.node,
    size: selection_prototype.size,
    empty: selection_prototype.empty,
    each: selection_prototype.each,
    on: transition_on,
    attr: transition_attr,
    attrTween: transition_attrTween,
    style: transition_style,
    styleTween: transition_styleTween,
    text: transition_text,
    textTween: transition_textTween,
    remove: transition_remove,
    tween: transition_tween,
    delay: transition_delay,
    duration: transition_duration,
    ease: transition_ease,
    easeVarying: transition_easeVarying,
    end: transition_end,
    [Symbol.iterator]: selection_prototype[Symbol.iterator]
  };
  function cubicInOut(t) {
    return ((t *= 2) <= 1 ? t * t * t : (t -= 2) * t * t + 2) / 2;
  }
  var defaultTiming = {
    time: null,
    // Set on use.
    delay: 0,
    duration: 250,
    ease: cubicInOut
  };
  function inherit(node, id2) {
    var timing;
    while (!(timing = node.__transition) || !(timing = timing[id2])) {
      if (!(node = node.parentNode)) {
        throw new Error(`transition ${id2} not found`);
      }
    }
    return timing;
  }
  function selection_transition(name) {
    var id2, timing;
    if (name instanceof Transition) {
      id2 = name._id, name = name._name;
    } else {
      id2 = newId(), (timing = defaultTiming).time = now(), name = name == null ? null : name + "";
    }
    for (var groups = this._groups, m = groups.length, j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          schedule(node, name, id2, i, group, timing || inherit(node, id2));
        }
      }
    }
    return new Transition(groups, this._parents, name, id2);
  }
  selection.prototype.interrupt = selection_interrupt;
  selection.prototype.transition = selection_transition;
  const constant = (x) => () => x;
  function ZoomEvent(type, {
    sourceEvent: sourceEvent2,
    target,
    transform,
    dispatch: dispatch2
  }) {
    Object.defineProperties(this, {
      type: { value: type, enumerable: true, configurable: true },
      sourceEvent: { value: sourceEvent2, enumerable: true, configurable: true },
      target: { value: target, enumerable: true, configurable: true },
      transform: { value: transform, enumerable: true, configurable: true },
      _: { value: dispatch2 }
    });
  }
  function Transform(k, x, y) {
    this.k = k;
    this.x = x;
    this.y = y;
  }
  Transform.prototype = {
    constructor: Transform,
    scale: function(k) {
      return k === 1 ? this : new Transform(this.k * k, this.x, this.y);
    },
    translate: function(x, y) {
      return x === 0 & y === 0 ? this : new Transform(this.k, this.x + this.k * x, this.y + this.k * y);
    },
    apply: function(point) {
      return [point[0] * this.k + this.x, point[1] * this.k + this.y];
    },
    applyX: function(x) {
      return x * this.k + this.x;
    },
    applyY: function(y) {
      return y * this.k + this.y;
    },
    invert: function(location) {
      return [(location[0] - this.x) / this.k, (location[1] - this.y) / this.k];
    },
    invertX: function(x) {
      return (x - this.x) / this.k;
    },
    invertY: function(y) {
      return (y - this.y) / this.k;
    },
    rescaleX: function(x) {
      return x.copy().domain(x.range().map(this.invertX, this).map(x.invert, x));
    },
    rescaleY: function(y) {
      return y.copy().domain(y.range().map(this.invertY, this).map(y.invert, y));
    },
    toString: function() {
      return "translate(" + this.x + "," + this.y + ") scale(" + this.k + ")";
    }
  };
  var identity = new Transform(1, 0, 0);
  Transform.prototype;
  function nopropagation(event) {
    event.stopImmediatePropagation();
  }
  function noevent(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function defaultFilter(event) {
    return (!event.ctrlKey || event.type === "wheel") && !event.button;
  }
  function defaultExtent() {
    var e = this;
    if (e instanceof SVGElement) {
      e = e.ownerSVGElement || e;
      if (e.hasAttribute("viewBox")) {
        e = e.viewBox.baseVal;
        return [[e.x, e.y], [e.x + e.width, e.y + e.height]];
      }
      return [[0, 0], [e.width.baseVal.value, e.height.baseVal.value]];
    }
    return [[0, 0], [e.clientWidth, e.clientHeight]];
  }
  function defaultTransform() {
    return this.__zoom || identity;
  }
  function defaultWheelDelta(event) {
    return -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 2e-3) * (event.ctrlKey ? 10 : 1);
  }
  function defaultTouchable() {
    return navigator.maxTouchPoints || "ontouchstart" in this;
  }
  function defaultConstrain(transform, extent, translateExtent) {
    var dx0 = transform.invertX(extent[0][0]) - translateExtent[0][0], dx1 = transform.invertX(extent[1][0]) - translateExtent[1][0], dy0 = transform.invertY(extent[0][1]) - translateExtent[0][1], dy1 = transform.invertY(extent[1][1]) - translateExtent[1][1];
    return transform.translate(
      dx1 > dx0 ? (dx0 + dx1) / 2 : Math.min(0, dx0) || Math.max(0, dx1),
      dy1 > dy0 ? (dy0 + dy1) / 2 : Math.min(0, dy0) || Math.max(0, dy1)
    );
  }
  function zoom() {
    var filter2 = defaultFilter, extent = defaultExtent, constrain = defaultConstrain, wheelDelta = defaultWheelDelta, touchable = defaultTouchable, scaleExtent = [0, Infinity], translateExtent = [[-Infinity, -Infinity], [Infinity, Infinity]], duration = 250, interpolate2 = interpolateZoom, listeners = dispatch("start", "zoom", "end"), touchstarting, touchfirst, touchending, touchDelay = 500, wheelDelay = 150, clickDistance2 = 0, tapDistance = 10;
    function zoom2(selection2) {
      selection2.property("__zoom", defaultTransform).on("wheel.zoom", wheeled, { passive: false }).on("mousedown.zoom", mousedowned).on("dblclick.zoom", dblclicked).filter(touchable).on("touchstart.zoom", touchstarted).on("touchmove.zoom", touchmoved).on("touchend.zoom touchcancel.zoom", touchended).style("-webkit-tap-highlight-color", "rgba(0,0,0,0)");
    }
    zoom2.transform = function(collection, transform, point, event) {
      var selection2 = collection.selection ? collection.selection() : collection;
      selection2.property("__zoom", defaultTransform);
      if (collection !== selection2) {
        schedule2(collection, transform, point, event);
      } else {
        selection2.interrupt().each(function() {
          gesture(this, arguments).event(event).start().zoom(null, typeof transform === "function" ? transform.apply(this, arguments) : transform).end();
        });
      }
    };
    zoom2.scaleBy = function(selection2, k, p, event) {
      zoom2.scaleTo(selection2, function() {
        var k0 = this.__zoom.k, k1 = typeof k === "function" ? k.apply(this, arguments) : k;
        return k0 * k1;
      }, p, event);
    };
    zoom2.scaleTo = function(selection2, k, p, event) {
      zoom2.transform(selection2, function() {
        var e = extent.apply(this, arguments), t0 = this.__zoom, p0 = p == null ? centroid(e) : typeof p === "function" ? p.apply(this, arguments) : p, p1 = t0.invert(p0), k1 = typeof k === "function" ? k.apply(this, arguments) : k;
        return constrain(translate(scale(t0, k1), p0, p1), e, translateExtent);
      }, p, event);
    };
    zoom2.translateBy = function(selection2, x, y, event) {
      zoom2.transform(selection2, function() {
        return constrain(this.__zoom.translate(
          typeof x === "function" ? x.apply(this, arguments) : x,
          typeof y === "function" ? y.apply(this, arguments) : y
        ), extent.apply(this, arguments), translateExtent);
      }, null, event);
    };
    zoom2.translateTo = function(selection2, x, y, p, event) {
      zoom2.transform(selection2, function() {
        var e = extent.apply(this, arguments), t = this.__zoom, p0 = p == null ? centroid(e) : typeof p === "function" ? p.apply(this, arguments) : p;
        return constrain(identity.translate(p0[0], p0[1]).scale(t.k).translate(
          typeof x === "function" ? -x.apply(this, arguments) : -x,
          typeof y === "function" ? -y.apply(this, arguments) : -y
        ), e, translateExtent);
      }, p, event);
    };
    function scale(transform, k) {
      k = Math.max(scaleExtent[0], Math.min(scaleExtent[1], k));
      return k === transform.k ? transform : new Transform(k, transform.x, transform.y);
    }
    function translate(transform, p0, p1) {
      var x = p0[0] - p1[0] * transform.k, y = p0[1] - p1[1] * transform.k;
      return x === transform.x && y === transform.y ? transform : new Transform(transform.k, x, y);
    }
    function centroid(extent2) {
      return [(+extent2[0][0] + +extent2[1][0]) / 2, (+extent2[0][1] + +extent2[1][1]) / 2];
    }
    function schedule2(transition2, transform, point, event) {
      transition2.on("start.zoom", function() {
        gesture(this, arguments).event(event).start();
      }).on("interrupt.zoom end.zoom", function() {
        gesture(this, arguments).event(event).end();
      }).tween("zoom", function() {
        var that = this, args = arguments, g = gesture(that, args).event(event), e = extent.apply(that, args), p = point == null ? centroid(e) : typeof point === "function" ? point.apply(that, args) : point, w = Math.max(e[1][0] - e[0][0], e[1][1] - e[0][1]), a = that.__zoom, b = typeof transform === "function" ? transform.apply(that, args) : transform, i = interpolate2(a.invert(p).concat(w / a.k), b.invert(p).concat(w / b.k));
        return function(t) {
          if (t === 1)
            t = b;
          else {
            var l = i(t), k = w / l[2];
            t = new Transform(k, p[0] - l[0] * k, p[1] - l[1] * k);
          }
          g.zoom(null, t);
        };
      });
    }
    function gesture(that, args, clean) {
      return !clean && that.__zooming || new Gesture(that, args);
    }
    function Gesture(that, args) {
      this.that = that;
      this.args = args;
      this.active = 0;
      this.sourceEvent = null;
      this.extent = extent.apply(that, args);
      this.taps = 0;
    }
    Gesture.prototype = {
      event: function(event) {
        if (event)
          this.sourceEvent = event;
        return this;
      },
      start: function() {
        if (++this.active === 1) {
          this.that.__zooming = this;
          this.emit("start");
        }
        return this;
      },
      zoom: function(key, transform) {
        if (this.mouse && key !== "mouse")
          this.mouse[1] = transform.invert(this.mouse[0]);
        if (this.touch0 && key !== "touch")
          this.touch0[1] = transform.invert(this.touch0[0]);
        if (this.touch1 && key !== "touch")
          this.touch1[1] = transform.invert(this.touch1[0]);
        this.that.__zoom = transform;
        this.emit("zoom");
        return this;
      },
      end: function() {
        if (--this.active === 0) {
          delete this.that.__zooming;
          this.emit("end");
        }
        return this;
      },
      emit: function(type) {
        var d = select(this.that).datum();
        listeners.call(
          type,
          this.that,
          new ZoomEvent(type, {
            sourceEvent: this.sourceEvent,
            target: zoom2,
            type,
            transform: this.that.__zoom,
            dispatch: listeners
          }),
          d
        );
      }
    };
    function wheeled(event, ...args) {
      if (!filter2.apply(this, arguments))
        return;
      var g = gesture(this, args).event(event), t = this.__zoom, k = Math.max(scaleExtent[0], Math.min(scaleExtent[1], t.k * Math.pow(2, wheelDelta.apply(this, arguments)))), p = pointer(event);
      if (g.wheel) {
        if (g.mouse[0][0] !== p[0] || g.mouse[0][1] !== p[1]) {
          g.mouse[1] = t.invert(g.mouse[0] = p);
        }
        clearTimeout(g.wheel);
      } else if (t.k === k)
        return;
      else {
        g.mouse = [p, t.invert(p)];
        interrupt(this);
        g.start();
      }
      noevent(event);
      g.wheel = setTimeout(wheelidled, wheelDelay);
      g.zoom("mouse", constrain(translate(scale(t, k), g.mouse[0], g.mouse[1]), g.extent, translateExtent));
      function wheelidled() {
        g.wheel = null;
        g.end();
      }
    }
    function mousedowned(event, ...args) {
      if (touchending || !filter2.apply(this, arguments))
        return;
      var currentTarget = event.currentTarget, g = gesture(this, args, true).event(event), v = select(event.view).on("mousemove.zoom", mousemoved, true).on("mouseup.zoom", mouseupped, true), p = pointer(event, currentTarget), x0 = event.clientX, y0 = event.clientY;
      dragDisable(event.view);
      nopropagation(event);
      g.mouse = [p, this.__zoom.invert(p)];
      interrupt(this);
      g.start();
      function mousemoved(event2) {
        noevent(event2);
        if (!g.moved) {
          var dx = event2.clientX - x0, dy = event2.clientY - y0;
          g.moved = dx * dx + dy * dy > clickDistance2;
        }
        g.event(event2).zoom("mouse", constrain(translate(g.that.__zoom, g.mouse[0] = pointer(event2, currentTarget), g.mouse[1]), g.extent, translateExtent));
      }
      function mouseupped(event2) {
        v.on("mousemove.zoom mouseup.zoom", null);
        yesdrag(event2.view, g.moved);
        noevent(event2);
        g.event(event2).end();
      }
    }
    function dblclicked(event, ...args) {
      if (!filter2.apply(this, arguments))
        return;
      var t0 = this.__zoom, p0 = pointer(event.changedTouches ? event.changedTouches[0] : event, this), p1 = t0.invert(p0), k1 = t0.k * (event.shiftKey ? 0.5 : 2), t1 = constrain(translate(scale(t0, k1), p0, p1), extent.apply(this, args), translateExtent);
      noevent(event);
      if (duration > 0)
        select(this).transition().duration(duration).call(schedule2, t1, p0, event);
      else
        select(this).call(zoom2.transform, t1, p0, event);
    }
    function touchstarted(event, ...args) {
      if (!filter2.apply(this, arguments))
        return;
      var touches = event.touches, n = touches.length, g = gesture(this, args, event.changedTouches.length === n).event(event), started, i, t, p;
      nopropagation(event);
      for (i = 0; i < n; ++i) {
        t = touches[i], p = pointer(t, this);
        p = [p, this.__zoom.invert(p), t.identifier];
        if (!g.touch0)
          g.touch0 = p, started = true, g.taps = 1 + !!touchstarting;
        else if (!g.touch1 && g.touch0[2] !== p[2])
          g.touch1 = p, g.taps = 0;
      }
      if (touchstarting)
        touchstarting = clearTimeout(touchstarting);
      if (started) {
        if (g.taps < 2)
          touchfirst = p[0], touchstarting = setTimeout(function() {
            touchstarting = null;
          }, touchDelay);
        interrupt(this);
        g.start();
      }
    }
    function touchmoved(event, ...args) {
      if (!this.__zooming)
        return;
      var g = gesture(this, args).event(event), touches = event.changedTouches, n = touches.length, i, t, p, l;
      noevent(event);
      for (i = 0; i < n; ++i) {
        t = touches[i], p = pointer(t, this);
        if (g.touch0 && g.touch0[2] === t.identifier)
          g.touch0[0] = p;
        else if (g.touch1 && g.touch1[2] === t.identifier)
          g.touch1[0] = p;
      }
      t = g.that.__zoom;
      if (g.touch1) {
        var p0 = g.touch0[0], l0 = g.touch0[1], p1 = g.touch1[0], l1 = g.touch1[1], dp = (dp = p1[0] - p0[0]) * dp + (dp = p1[1] - p0[1]) * dp, dl = (dl = l1[0] - l0[0]) * dl + (dl = l1[1] - l0[1]) * dl;
        t = scale(t, Math.sqrt(dp / dl));
        p = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
        l = [(l0[0] + l1[0]) / 2, (l0[1] + l1[1]) / 2];
      } else if (g.touch0)
        p = g.touch0[0], l = g.touch0[1];
      else
        return;
      g.zoom("touch", constrain(translate(t, p, l), g.extent, translateExtent));
    }
    function touchended(event, ...args) {
      if (!this.__zooming)
        return;
      var g = gesture(this, args).event(event), touches = event.changedTouches, n = touches.length, i, t;
      nopropagation(event);
      if (touchending)
        clearTimeout(touchending);
      touchending = setTimeout(function() {
        touchending = null;
      }, touchDelay);
      for (i = 0; i < n; ++i) {
        t = touches[i];
        if (g.touch0 && g.touch0[2] === t.identifier)
          delete g.touch0;
        else if (g.touch1 && g.touch1[2] === t.identifier)
          delete g.touch1;
      }
      if (g.touch1 && !g.touch0)
        g.touch0 = g.touch1, delete g.touch1;
      if (g.touch0)
        g.touch0[1] = this.__zoom.invert(g.touch0[0]);
      else {
        g.end();
        if (g.taps === 2) {
          t = pointer(t, this);
          if (Math.hypot(touchfirst[0] - t[0], touchfirst[1] - t[1]) < tapDistance) {
            var p = select(this).on("dblclick.zoom");
            if (p)
              p.apply(this, arguments);
          }
        }
      }
    }
    zoom2.wheelDelta = function(_) {
      return arguments.length ? (wheelDelta = typeof _ === "function" ? _ : constant(+_), zoom2) : wheelDelta;
    };
    zoom2.filter = function(_) {
      return arguments.length ? (filter2 = typeof _ === "function" ? _ : constant(!!_), zoom2) : filter2;
    };
    zoom2.touchable = function(_) {
      return arguments.length ? (touchable = typeof _ === "function" ? _ : constant(!!_), zoom2) : touchable;
    };
    zoom2.extent = function(_) {
      return arguments.length ? (extent = typeof _ === "function" ? _ : constant([[+_[0][0], +_[0][1]], [+_[1][0], +_[1][1]]]), zoom2) : extent;
    };
    zoom2.scaleExtent = function(_) {
      return arguments.length ? (scaleExtent[0] = +_[0], scaleExtent[1] = +_[1], zoom2) : [scaleExtent[0], scaleExtent[1]];
    };
    zoom2.translateExtent = function(_) {
      return arguments.length ? (translateExtent[0][0] = +_[0][0], translateExtent[1][0] = +_[1][0], translateExtent[0][1] = +_[0][1], translateExtent[1][1] = +_[1][1], zoom2) : [[translateExtent[0][0], translateExtent[0][1]], [translateExtent[1][0], translateExtent[1][1]]];
    };
    zoom2.constrain = function(_) {
      return arguments.length ? (constrain = _, zoom2) : constrain;
    };
    zoom2.duration = function(_) {
      return arguments.length ? (duration = +_, zoom2) : duration;
    };
    zoom2.interpolate = function(_) {
      return arguments.length ? (interpolate2 = _, zoom2) : interpolate2;
    };
    zoom2.on = function() {
      var value = listeners.on.apply(listeners, arguments);
      return value === listeners ? zoom2 : value;
    };
    zoom2.clickDistance = function(_) {
      return arguments.length ? (clickDistance2 = (_ = +_) * _, zoom2) : Math.sqrt(clickDistance2);
    };
    zoom2.tapDistance = function(_) {
      return arguments.length ? (tapDistance = +_, zoom2) : tapDistance;
    };
    return zoom2;
  }
  var Position = /* @__PURE__ */ ((Position2) => {
    Position2["Left"] = "left";
    Position2["Top"] = "top";
    Position2["Right"] = "right";
    Position2["Bottom"] = "bottom";
    return Position2;
  })(Position || {});
  var SelectionMode = /* @__PURE__ */ ((SelectionMode2) => {
    SelectionMode2["Partial"] = "partial";
    SelectionMode2["Full"] = "full";
    return SelectionMode2;
  })(SelectionMode || {});
  var ConnectionLineType = /* @__PURE__ */ ((ConnectionLineType2) => {
    ConnectionLineType2["Bezier"] = "default";
    ConnectionLineType2["SimpleBezier"] = "simple-bezier";
    ConnectionLineType2["Straight"] = "straight";
    ConnectionLineType2["Step"] = "step";
    ConnectionLineType2["SmoothStep"] = "smoothstep";
    return ConnectionLineType2;
  })(ConnectionLineType || {});
  var ConnectionMode = /* @__PURE__ */ ((ConnectionMode2) => {
    ConnectionMode2["Strict"] = "strict";
    ConnectionMode2["Loose"] = "loose";
    return ConnectionMode2;
  })(ConnectionMode || {});
  var MarkerType = /* @__PURE__ */ ((MarkerType2) => {
    MarkerType2["Arrow"] = "arrow";
    MarkerType2["ArrowClosed"] = "arrowclosed";
    return MarkerType2;
  })(MarkerType || {});
  var PanOnScrollMode = /* @__PURE__ */ ((PanOnScrollMode2) => {
    PanOnScrollMode2["Free"] = "free";
    PanOnScrollMode2["Vertical"] = "vertical";
    PanOnScrollMode2["Horizontal"] = "horizontal";
    return PanOnScrollMode2;
  })(PanOnScrollMode || {});
  var PanelPosition = /* @__PURE__ */ ((PanelPosition2) => {
    PanelPosition2["TopLeft"] = "top-left";
    PanelPosition2["TopCenter"] = "top-center";
    PanelPosition2["TopRight"] = "top-right";
    PanelPosition2["BottomLeft"] = "bottom-left";
    PanelPosition2["BottomCenter"] = "bottom-center";
    PanelPosition2["BottomRight"] = "bottom-right";
    return PanelPosition2;
  })(PanelPosition || {});
  function useWindow() {
    if (typeof window !== "undefined") {
      return window;
    } else {
      return {
        chrome: false,
        addEventListener(..._) {
        }
      };
    }
  }
  function isInputDOMNode(event) {
    var _a, _b;
    const target = ((_b = (_a = event.composedPath) == null ? void 0 : _a.call(event)) == null ? void 0 : _b[0]) || event.target;
    const hasAttribute = typeof (target == null ? void 0 : target.hasAttribute) === "function" ? target.hasAttribute("contenteditable") : false;
    const closest = typeof (target == null ? void 0 : target.closest) === "function" ? target.closest(".nokey") : null;
    return ["INPUT", "SELECT", "TEXTAREA"].includes(target == null ? void 0 : target.nodeName) || hasAttribute || !!closest;
  }
  function wasModifierPressed(event) {
    return event.ctrlKey || event.metaKey || event.shiftKey;
  }
  function isKeyMatch(pressedKey, keyToMatch, pressedKeys, isKeyUp) {
    const keyCombination = keyToMatch.split("+").map((k) => k.trim().toLowerCase());
    if (keyCombination.length === 1) {
      return pressedKey.toLowerCase() === keyToMatch.toLowerCase();
    }
    if (isKeyUp) {
      pressedKeys.delete(pressedKey.toLowerCase());
    } else {
      pressedKeys.add(pressedKey.toLowerCase());
    }
    return keyCombination.every(
      (key, index) => pressedKeys.has(key) && Array.from(pressedKeys.values())[index] === keyCombination[index]
    );
  }
  function createKeyPredicate(keyFilter, pressedKeys) {
    return (event) => {
      if (!event.code && !event.key) {
        return false;
      }
      const keyOrCode = useKeyOrCode(event.code, keyFilter);
      if (Array.isArray(keyFilter)) {
        return keyFilter.some((key) => isKeyMatch(event[keyOrCode], key, pressedKeys, event.type === "keyup"));
      }
      return isKeyMatch(event[keyOrCode], keyFilter, pressedKeys, event.type === "keyup");
    };
  }
  function useKeyOrCode(code, keysToWatch) {
    if (typeof keysToWatch === "string") {
      return code === keysToWatch ? "code" : "key";
    }
    return keysToWatch.includes(code) ? "code" : "key";
  }
  function useKeyPress(keyFilter, onChange) {
    const window2 = useWindow();
    const isPressed = vue.ref(vue.toValue(keyFilter) === true);
    let modifierPressed = false;
    const pressedKeys = /* @__PURE__ */ new Set();
    let currentFilter = createKeyFilterFn(vue.toValue(keyFilter));
    vue.watch(isPressed, (isKeyPressed, wasPressed) => {
      if (isKeyPressed !== wasPressed) {
        onChange == null ? void 0 : onChange(isKeyPressed);
      }
    });
    vue.watch(
      () => vue.toValue(keyFilter),
      (nextKeyFilter, previousKeyFilter) => {
        if (typeof previousKeyFilter === "boolean" && typeof nextKeyFilter !== "boolean") {
          reset();
        }
        currentFilter = createKeyFilterFn(nextKeyFilter);
      },
      {
        immediate: true
      }
    );
    useEventListener(window2, "blur", () => {
      if (vue.toValue(keyFilter) !== true) {
        isPressed.value = false;
      }
    });
    onKeyStroke(
      (...args) => currentFilter(...args),
      (e) => {
        modifierPressed = wasModifierPressed(e);
        if (!modifierPressed && isInputDOMNode(e)) {
          return;
        }
        e.preventDefault();
        isPressed.value = true;
      },
      { eventName: "keydown" }
    );
    onKeyStroke(
      (...args) => currentFilter(...args),
      (e) => {
        if (isPressed.value) {
          if (!modifierPressed && isInputDOMNode(e)) {
            return;
          }
          reset();
        }
      },
      { eventName: "keyup" }
    );
    return isPressed;
    function reset() {
      modifierPressed = false;
      pressedKeys.clear();
      isPressed.value = false;
    }
    function createKeyFilterFn(keyFilter2) {
      if (keyFilter2 === null) {
        reset();
        return () => false;
      }
      if (typeof keyFilter2 === "boolean") {
        reset();
        isPressed.value = keyFilter2;
        return () => false;
      }
      if (Array.isArray(keyFilter2) || typeof keyFilter2 === "string") {
        return createKeyPredicate(keyFilter2, pressedKeys);
      }
      return keyFilter2;
    }
  }
  const ARIA_NODE_DESC_KEY = "vue-flow__node-desc";
  const ARIA_EDGE_DESC_KEY = "vue-flow__edge-desc";
  const ARIA_LIVE_MESSAGE = "vue-flow__aria-live";
  const elementSelectionKeys = ["Enter", " ", "Escape"];
  const arrowKeyDiffs = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 }
  };
  function useDrag(params) {
    const {
      vueFlowRef,
      snapToGrid,
      snapGrid,
      noDragClassName,
      nodes,
      nodeExtent,
      nodeDragThreshold,
      viewport,
      autoPanOnNodeDrag,
      nodesDraggable,
      panBy,
      findNode,
      multiSelectionActive,
      nodesSelectionActive,
      selectNodesOnDrag,
      removeSelectedElements,
      addSelectedNodes,
      updateNodePositions,
      emits
    } = useVueFlow();
    const { onStart, onDrag, onStop, el, disabled, id: id2, selectable, dragHandle } = params;
    const dragging = vue.ref(false);
    let dragItems = [];
    let dragHandler;
    let containerBounds = null;
    let lastPos = { x: void 0, y: void 0 };
    let mousePosition = { x: 0, y: 0 };
    let dragEvent = null;
    let dragStarted = false;
    let autoPanId = 0;
    let autoPanStarted = false;
    const getPointerPosition = useGetPointerPosition();
    const updateNodes = ({ x, y }) => {
      lastPos = { x, y };
      let hasChange = false;
      dragItems = dragItems.map((n) => {
        const nextPosition = { x: x - n.distance.x, y: y - n.distance.y };
        if (snapToGrid.value) {
          nextPosition.x = snapGrid.value[0] * Math.round(nextPosition.x / snapGrid.value[0]);
          nextPosition.y = snapGrid.value[1] * Math.round(nextPosition.y / snapGrid.value[1]);
        }
        const { computedPosition } = calcNextPosition(
          n,
          nextPosition,
          emits.error,
          nodeExtent.value,
          n.parentNode ? findNode(n.parentNode) : void 0
        );
        hasChange = hasChange || n.position.x !== computedPosition.x || n.position.y !== computedPosition.y;
        n.position = computedPosition;
        return n;
      });
      if (!hasChange) {
        return;
      }
      updateNodePositions(dragItems, true, true);
      dragging.value = true;
      if (dragEvent) {
        const [currentNode, nodes2] = getEventHandlerParams({
          id: id2,
          dragItems,
          findNode
        });
        onDrag({ event: dragEvent, node: currentNode, nodes: nodes2 });
      }
    };
    const autoPan = () => {
      if (!containerBounds) {
        return;
      }
      const [xMovement, yMovement] = calcAutoPan(mousePosition, containerBounds);
      if (xMovement !== 0 || yMovement !== 0) {
        const nextPos = {
          x: (lastPos.x ?? 0) - xMovement / viewport.value.zoom,
          y: (lastPos.y ?? 0) - yMovement / viewport.value.zoom
        };
        if (panBy({ x: xMovement, y: yMovement })) {
          updateNodes(nextPos);
        }
      }
      autoPanId = requestAnimationFrame(autoPan);
    };
    const startDrag = (event, nodeEl) => {
      dragStarted = true;
      const node = findNode(id2);
      if (!selectNodesOnDrag.value && !multiSelectionActive.value && node) {
        if (!node.selected) {
          removeSelectedElements();
        }
      }
      if (node && vue.toValue(selectable) && selectNodesOnDrag.value) {
        handleNodeClick(
          node,
          multiSelectionActive.value,
          addSelectedNodes,
          removeSelectedElements,
          nodesSelectionActive,
          false,
          nodeEl
        );
      }
      const pointerPos = getPointerPosition(event);
      lastPos = pointerPos;
      dragItems = getDragItems(nodes.value, nodesDraggable.value, pointerPos, findNode, id2);
      if (dragItems.length) {
        const [currentNode, nodes2] = getEventHandlerParams({
          id: id2,
          dragItems,
          findNode
        });
        onStart({ event: event.sourceEvent, node: currentNode, nodes: nodes2 });
      }
    };
    const eventStart = (event, nodeEl) => {
      var _a;
      if (nodeDragThreshold.value === 0) {
        startDrag(event, nodeEl);
      }
      lastPos = getPointerPosition(event);
      containerBounds = ((_a = vueFlowRef.value) == null ? void 0 : _a.getBoundingClientRect()) || null;
      mousePosition = getEventPosition(event.sourceEvent, containerBounds);
    };
    const eventDrag = (event, nodeEl) => {
      const pointerPos = getPointerPosition(event);
      if (!autoPanStarted && dragStarted && autoPanOnNodeDrag.value) {
        autoPanStarted = true;
        autoPan();
      }
      if (!dragStarted) {
        const x = pointerPos.xSnapped - (lastPos.x ?? 0);
        const y = pointerPos.ySnapped - (lastPos.y ?? 0);
        const distance2 = Math.sqrt(x * x + y * y);
        if (distance2 > nodeDragThreshold.value) {
          startDrag(event, nodeEl);
        }
      }
      if ((lastPos.x !== pointerPos.xSnapped || lastPos.y !== pointerPos.ySnapped) && dragItems.length && dragStarted) {
        dragEvent = event.sourceEvent;
        mousePosition = getEventPosition(event.sourceEvent, containerBounds);
        updateNodes(pointerPos);
      }
    };
    const eventEnd = (event) => {
      if (!dragStarted) {
        return;
      }
      dragging.value = false;
      autoPanStarted = false;
      dragStarted = false;
      cancelAnimationFrame(autoPanId);
      if (dragItems.length) {
        updateNodePositions(dragItems, false, false);
        const [currentNode, nodes2] = getEventHandlerParams({
          id: id2,
          dragItems,
          findNode
        });
        onStop({ event: event.sourceEvent, node: currentNode, nodes: nodes2 });
      }
    };
    vue.watch([() => vue.toValue(disabled), el], ([isDisabled, nodeEl], _, onCleanup) => {
      if (nodeEl) {
        const selection2 = select(nodeEl);
        if (!isDisabled) {
          dragHandler = drag().on("start", (event) => eventStart(event, nodeEl)).on("drag", (event) => eventDrag(event, nodeEl)).on("end", (event) => eventEnd(event)).filter((event) => {
            const target = event.target;
            const unrefDragHandle = vue.toValue(dragHandle);
            return !event.button && (!noDragClassName.value || !hasSelector(target, `.${noDragClassName.value}`, nodeEl) && (!unrefDragHandle || hasSelector(target, unrefDragHandle, nodeEl)));
          });
          selection2.call(dragHandler);
        }
        onCleanup(() => {
          selection2.on(".drag", null);
          if (dragHandler) {
            dragHandler.on("start", null);
            dragHandler.on("drag", null);
            dragHandler.on("end", null);
          }
        });
      }
    });
    return dragging;
  }
  const VueFlow = Symbol("vueFlow");
  const NodeId = Symbol("nodeId");
  const NodeRef = Symbol("nodeRef");
  const EdgeId = Symbol("edgeId");
  const EdgeRef = Symbol("edgeRef");
  const Slots = Symbol("slots");
  function useEdge(id2) {
    const edgeId = id2 ?? vue.inject(EdgeId, "");
    const edgeEl = vue.inject(EdgeRef, vue.ref(null));
    const { findEdge, emits } = useVueFlow();
    const edge = findEdge(edgeId);
    if (!edge) {
      emits.error(new VueFlowError(ErrorCode.EDGE_NOT_FOUND, edgeId));
    }
    return {
      id: edgeId,
      edge,
      edgeEl
    };
  }
  function createEdgeHooks() {
    return {
      doubleClick: createExtendedEventHook(),
      click: createExtendedEventHook(),
      mouseEnter: createExtendedEventHook(),
      mouseMove: createExtendedEventHook(),
      mouseLeave: createExtendedEventHook(),
      contextMenu: createExtendedEventHook(),
      updateStart: createExtendedEventHook(),
      update: createExtendedEventHook(),
      updateEnd: createExtendedEventHook()
    };
  }
  function useEdgeHooks(edge, emits) {
    const edgeHooks = createEdgeHooks();
    edgeHooks.doubleClick.on((event) => {
      var _a, _b;
      emits.edgeDoubleClick(event);
      (_b = (_a = edge.events) == null ? void 0 : _a.doubleClick) == null ? void 0 : _b.call(_a, event);
    });
    edgeHooks.click.on((event) => {
      var _a, _b;
      emits.edgeClick(event);
      (_b = (_a = edge.events) == null ? void 0 : _a.click) == null ? void 0 : _b.call(_a, event);
    });
    edgeHooks.mouseEnter.on((event) => {
      var _a, _b;
      emits.edgeMouseEnter(event);
      (_b = (_a = edge.events) == null ? void 0 : _a.mouseEnter) == null ? void 0 : _b.call(_a, event);
    });
    edgeHooks.mouseMove.on((event) => {
      var _a, _b;
      emits.edgeMouseMove(event);
      (_b = (_a = edge.events) == null ? void 0 : _a.mouseMove) == null ? void 0 : _b.call(_a, event);
    });
    edgeHooks.mouseLeave.on((event) => {
      var _a, _b;
      emits.edgeMouseLeave(event);
      (_b = (_a = edge.events) == null ? void 0 : _a.mouseLeave) == null ? void 0 : _b.call(_a, event);
    });
    edgeHooks.contextMenu.on((event) => {
      var _a, _b;
      emits.edgeContextMenu(event);
      (_b = (_a = edge.events) == null ? void 0 : _a.contextMenu) == null ? void 0 : _b.call(_a, event);
    });
    edgeHooks.updateStart.on((event) => {
      var _a, _b;
      emits.edgeUpdateStart(event);
      (_b = (_a = edge.events) == null ? void 0 : _a.updateStart) == null ? void 0 : _b.call(_a, event);
    });
    edgeHooks.update.on((event) => {
      var _a, _b;
      emits.edgeUpdate(event);
      (_b = (_a = edge.events) == null ? void 0 : _a.update) == null ? void 0 : _b.call(_a, event);
    });
    edgeHooks.updateEnd.on((event) => {
      var _a, _b;
      emits.edgeUpdateEnd(event);
      (_b = (_a = edge.events) == null ? void 0 : _a.updateEnd) == null ? void 0 : _b.call(_a, event);
    });
    return Object.entries(edgeHooks).reduce(
      (hooks, [key, value]) => {
        hooks.emit[key] = value.trigger;
        hooks.on[key] = value.on;
        return hooks;
      },
      { emit: {}, on: {} }
    );
  }
  function useGetPointerPosition() {
    const { viewport, snapGrid, snapToGrid } = useVueFlow();
    return ({ sourceEvent: sourceEvent2 }) => {
      const x = sourceEvent2.touches ? sourceEvent2.touches[0].clientX : sourceEvent2.clientX;
      const y = sourceEvent2.touches ? sourceEvent2.touches[0].clientY : sourceEvent2.clientY;
      const pointerPos = {
        x: (x - viewport.value.x) / viewport.value.zoom,
        y: (y - viewport.value.y) / viewport.value.zoom
      };
      return {
        xSnapped: snapToGrid.value ? snapGrid.value[0] * Math.round(pointerPos.x / snapGrid.value[0]) : pointerPos.x,
        ySnapped: snapToGrid.value ? snapGrid.value[1] * Math.round(pointerPos.y / snapGrid.value[1]) : pointerPos.y,
        ...pointerPos
      };
    };
  }
  function alwaysValid() {
    return true;
  }
  function useHandle({
    handleId,
    nodeId,
    type,
    isValidConnection,
    edgeUpdaterType,
    onEdgeUpdate,
    onEdgeUpdateEnd
  }) {
    const {
      vueFlowRef,
      connectionMode,
      connectionRadius,
      connectOnClick,
      connectionClickStartHandle,
      nodesConnectable,
      autoPanOnConnect,
      findNode,
      panBy,
      startConnection,
      updateConnection,
      endConnection,
      emits,
      viewport,
      edges,
      nodes,
      isValidConnection: isValidConnectionProp
    } = useVueFlow();
    let connection = null;
    let isValid = false;
    let handleDomNode = null;
    function handlePointerDown(event) {
      var _a;
      const isTarget = vue.toValue(type) === "target";
      const isMouseTriggered = isMouseEvent(event);
      const doc = getHostForElement(event.target);
      if (isMouseTriggered && event.button === 0 || !isMouseTriggered) {
        let onPointerMove = function(event2) {
          connectionPosition = getEventPosition(event2, containerBounds);
          const { handle, validHandleResult } = getClosestHandle(
            event2,
            doc,
            pointToRendererPoint(connectionPosition, viewport.value, false, [1, 1]),
            connectionRadius.value,
            handleLookup,
            (handle2) => isValidHandle(
              event2,
              handle2,
              connectionMode.value,
              vue.toValue(nodeId),
              vue.toValue(handleId),
              isTarget ? "target" : "source",
              isValidConnectionHandler,
              doc,
              edges.value,
              nodes.value,
              findNode
            )
          );
          closestHandle = handle;
          if (!autoPanStarted) {
            autoPan();
            autoPanStarted = true;
          }
          connection = validHandleResult.connection;
          isValid = validHandleResult.isValid;
          handleDomNode = validHandleResult.handleDomNode;
          updateConnection(
            closestHandle && isValid ? rendererPointToPoint(
              {
                x: closestHandle.x,
                y: closestHandle.y
              },
              viewport.value
            ) : connectionPosition,
            validHandleResult.endHandle,
            getConnectionStatus(!!closestHandle, isValid)
          );
          if (!closestHandle && !isValid && !handleDomNode) {
            return resetRecentHandle(prevActiveHandle);
          }
          if (connection && connection.source !== connection.target && handleDomNode) {
            resetRecentHandle(prevActiveHandle);
            prevActiveHandle = handleDomNode;
            handleDomNode.classList.add("connecting", "vue-flow__handle-connecting");
            handleDomNode.classList.toggle("valid", isValid);
            handleDomNode.classList.toggle("vue-flow__handle-valid", isValid);
          }
        }, onPointerUp = function(event2) {
          if ((closestHandle || handleDomNode) && connection && isValid) {
            if (!onEdgeUpdate) {
              emits.connect(connection);
            } else {
              onEdgeUpdate(event2, connection);
            }
          }
          emits.connectEnd(event2);
          if (edgeUpdaterType) {
            onEdgeUpdateEnd == null ? void 0 : onEdgeUpdateEnd(event2);
          }
          resetRecentHandle(prevActiveHandle);
          cancelAnimationFrame(autoPanId);
          endConnection(event2);
          autoPanStarted = false;
          isValid = false;
          connection = null;
          handleDomNode = null;
          doc.removeEventListener("mousemove", onPointerMove);
          doc.removeEventListener("mouseup", onPointerUp);
          doc.removeEventListener("touchmove", onPointerMove);
          doc.removeEventListener("touchend", onPointerUp);
        };
        const node = findNode(vue.toValue(nodeId));
        let isValidConnectionHandler = vue.toValue(isValidConnection) || isValidConnectionProp.value || alwaysValid;
        if (!isValidConnectionHandler && node) {
          isValidConnectionHandler = (!isTarget ? node.isValidTargetPos : node.isValidSourcePos) || alwaysValid;
        }
        let closestHandle;
        let autoPanId = 0;
        const { x, y } = getEventPosition(event);
        const clickedHandle = doc == null ? void 0 : doc.elementFromPoint(x, y);
        const handleType = getHandleType(vue.toValue(edgeUpdaterType), clickedHandle);
        const containerBounds = (_a = vueFlowRef.value) == null ? void 0 : _a.getBoundingClientRect();
        if (!containerBounds || !handleType) {
          return;
        }
        let prevActiveHandle;
        let connectionPosition = getEventPosition(event, containerBounds);
        let autoPanStarted = false;
        const handleLookup = getHandleLookup({
          nodes: nodes.value,
          nodeId: vue.toValue(nodeId),
          handleId: vue.toValue(handleId),
          handleType
        });
        const autoPan = () => {
          if (!autoPanOnConnect) {
            return;
          }
          const [xMovement, yMovement] = calcAutoPan(connectionPosition, containerBounds);
          panBy({ x: xMovement, y: yMovement });
          autoPanId = requestAnimationFrame(autoPan);
        };
        startConnection(
          {
            nodeId: vue.toValue(nodeId),
            handleId: vue.toValue(handleId),
            type: handleType
          },
          {
            x: x - containerBounds.left,
            y: y - containerBounds.top
          },
          event
        );
        emits.connectStart({ event, nodeId: vue.toValue(nodeId), handleId: vue.toValue(handleId), handleType });
        doc.addEventListener("mousemove", onPointerMove);
        doc.addEventListener("mouseup", onPointerUp);
        doc.addEventListener("touchmove", onPointerMove);
        doc.addEventListener("touchend", onPointerUp);
      }
    }
    function handleClick(event) {
      if (!connectOnClick.value) {
        return;
      }
      const isTarget = vue.toValue(type) === "target";
      if (!connectionClickStartHandle.value) {
        emits.clickConnectStart({ event, nodeId: vue.toValue(nodeId), handleId: vue.toValue(handleId) });
        startConnection({ nodeId: vue.toValue(nodeId), type: vue.toValue(type), handleId: vue.toValue(handleId) }, void 0, event, true);
      } else {
        let isValidConnectionHandler = vue.toValue(isValidConnection) || isValidConnectionProp.value || alwaysValid;
        const node = findNode(vue.toValue(nodeId));
        if (!isValidConnectionHandler && node) {
          isValidConnectionHandler = (!isTarget ? node.isValidTargetPos : node.isValidSourcePos) || alwaysValid;
        }
        if (node && (typeof node.connectable === "undefined" ? nodesConnectable.value : node.connectable) === false) {
          return;
        }
        const doc = getHostForElement(event.target);
        const { connection: connection2, isValid: isValid2 } = isValidHandle(
          event,
          {
            nodeId: vue.toValue(nodeId),
            id: vue.toValue(handleId),
            type: vue.toValue(type)
          },
          connectionMode.value,
          connectionClickStartHandle.value.nodeId,
          connectionClickStartHandle.value.handleId || null,
          connectionClickStartHandle.value.type,
          isValidConnectionHandler,
          doc,
          edges.value,
          nodes.value,
          findNode
        );
        const isOwnHandle = connection2.source === connection2.target;
        if (isValid2 && !isOwnHandle) {
          emits.connect(connection2);
        }
        emits.clickConnectEnd(event);
        endConnection(event, true);
      }
    }
    return {
      handlePointerDown,
      handleClick
    };
  }
  function useNodeId() {
    return vue.inject(NodeId, "");
  }
  function useNode(id2) {
    const nodeId = id2 ?? useNodeId() ?? "";
    const nodeEl = vue.inject(NodeRef, vue.ref(null));
    const { findNode, edges, emits } = useVueFlow();
    const node = findNode(nodeId);
    if (!node) {
      emits.error(new VueFlowError(ErrorCode.NODE_NOT_FOUND, nodeId));
    }
    return {
      id: nodeId,
      nodeEl,
      node,
      parentNode: vue.computed(() => findNode(node.parentNode)),
      connectedEdges: vue.computed(() => getConnectedEdges([node], edges.value))
    };
  }
  function createNodeHooks() {
    return {
      doubleClick: createExtendedEventHook(),
      click: createExtendedEventHook(),
      mouseEnter: createExtendedEventHook(),
      mouseMove: createExtendedEventHook(),
      mouseLeave: createExtendedEventHook(),
      contextMenu: createExtendedEventHook(),
      dragStart: createExtendedEventHook(),
      drag: createExtendedEventHook(),
      dragStop: createExtendedEventHook()
    };
  }
  function useNodeHooks(node, emits) {
    const nodeHooks = createNodeHooks();
    nodeHooks.doubleClick.on((event) => {
      var _a, _b;
      emits.nodeDoubleClick(event);
      (_b = (_a = node.events) == null ? void 0 : _a.doubleClick) == null ? void 0 : _b.call(_a, event);
    });
    nodeHooks.click.on((event) => {
      var _a, _b;
      emits.nodeClick(event);
      (_b = (_a = node.events) == null ? void 0 : _a.click) == null ? void 0 : _b.call(_a, event);
    });
    nodeHooks.mouseEnter.on((event) => {
      var _a, _b;
      emits.nodeMouseEnter(event);
      (_b = (_a = node.events) == null ? void 0 : _a.mouseEnter) == null ? void 0 : _b.call(_a, event);
    });
    nodeHooks.mouseMove.on((event) => {
      var _a, _b;
      emits.nodeMouseMove(event);
      (_b = (_a = node.events) == null ? void 0 : _a.mouseMove) == null ? void 0 : _b.call(_a, event);
    });
    nodeHooks.mouseLeave.on((event) => {
      var _a, _b;
      emits.nodeMouseLeave(event);
      (_b = (_a = node.events) == null ? void 0 : _a.mouseLeave) == null ? void 0 : _b.call(_a, event);
    });
    nodeHooks.contextMenu.on((event) => {
      var _a, _b;
      emits.nodeContextMenu(event);
      (_b = (_a = node.events) == null ? void 0 : _a.contextMenu) == null ? void 0 : _b.call(_a, event);
    });
    nodeHooks.dragStart.on((event) => {
      var _a, _b;
      emits.nodeDragStart(event);
      (_b = (_a = node.events) == null ? void 0 : _a.dragStart) == null ? void 0 : _b.call(_a, event);
    });
    nodeHooks.drag.on((event) => {
      var _a, _b;
      emits.nodeDrag(event);
      (_b = (_a = node.events) == null ? void 0 : _a.drag) == null ? void 0 : _b.call(_a, event);
    });
    nodeHooks.dragStop.on((event) => {
      var _a, _b;
      emits.nodeDragStop(event);
      (_b = (_a = node.events) == null ? void 0 : _a.dragStop) == null ? void 0 : _b.call(_a, event);
    });
    return Object.entries(nodeHooks).reduce(
      (hooks, [key, value]) => {
        hooks.emit[key] = value.trigger;
        hooks.on[key] = value.on;
        return hooks;
      },
      { emit: {}, on: {} }
    );
  }
  function useUpdateNodePositions() {
    const { getSelectedNodes, nodeExtent, updateNodePositions, findNode, snapGrid, snapToGrid, nodesDraggable, emits } = useVueFlow();
    return (positionDiff, isShiftPressed = false) => {
      const xVelo = snapToGrid.value ? snapGrid.value[0] : 5;
      const yVelo = snapToGrid.value ? snapGrid.value[1] : 5;
      const factor = isShiftPressed ? 4 : 1;
      const positionDiffX = positionDiff.x * xVelo * factor;
      const positionDiffY = positionDiff.y * yVelo * factor;
      const nodeUpdates = getSelectedNodes.value.filter((n) => n.draggable || nodesDraggable && typeof n.draggable === "undefined").map((n) => {
        const nextPosition = { x: n.computedPosition.x + positionDiffX, y: n.computedPosition.y + positionDiffY };
        const { computedPosition } = calcNextPosition(
          n,
          nextPosition,
          emits.error,
          nodeExtent.value,
          n.parentNode ? findNode(n.parentNode) : void 0
        );
        return {
          id: n.id,
          position: computedPosition,
          from: n.position,
          distance: { x: positionDiff.x, y: positionDiff.y },
          dimensions: n.dimensions
        };
      });
      updateNodePositions(nodeUpdates, true, false);
    };
  }
  const DEFAULT_PADDING = 0.1;
  function noop() {
    warn("Viewport not initialized yet.");
    return Promise.resolve(false);
  }
  const initialViewportHelper = {
    zoomIn: noop,
    zoomOut: noop,
    zoomTo: noop,
    fitView: noop,
    setCenter: noop,
    fitBounds: noop,
    project: (position) => position,
    screenToFlowCoordinate: (position) => position,
    flowToScreenCoordinate: (position) => position,
    setViewport: noop,
    setTransform: noop,
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    getTransform: () => ({ x: 0, y: 0, zoom: 1 }),
    viewportInitialized: false
  };
  function useViewportHelper(state) {
    function zoom2(scale, duration) {
      return new Promise((resolve) => {
        if (state.d3Selection && state.d3Zoom) {
          state.d3Zoom.scaleBy(
            transition(state.d3Selection, duration, () => {
              resolve(true);
            }),
            scale
          );
        } else {
          resolve(false);
        }
      });
    }
    function transformViewport(x, y, zoom22, duration) {
      return new Promise((resolve) => {
        const { x: clampedX, y: clampedY } = clampPosition({ x: -x, y: -y }, state.translateExtent);
        const nextTransform = identity.translate(-clampedX, -clampedY).scale(zoom22);
        if (state.d3Selection && state.d3Zoom) {
          state.d3Zoom.transform(
            transition(state.d3Selection, duration, () => {
              resolve(true);
            }),
            nextTransform
          );
        } else {
          resolve(false);
        }
      });
    }
    return vue.computed(() => {
      const isInitialized = state.d3Zoom && state.d3Selection && state.dimensions.width && state.dimensions.height;
      if (!isInitialized) {
        return initialViewportHelper;
      }
      return {
        viewportInitialized: true,
        // todo: allow passing scale as option
        zoomIn: (options) => {
          return zoom2(1.2, options == null ? void 0 : options.duration);
        },
        zoomOut: (options) => {
          return zoom2(1 / 1.2, options == null ? void 0 : options.duration);
        },
        zoomTo: (zoomLevel, options) => {
          return new Promise((resolve) => {
            if (state.d3Selection && state.d3Zoom) {
              state.d3Zoom.scaleTo(
                transition(state.d3Selection, options == null ? void 0 : options.duration, () => {
                  resolve(true);
                }),
                zoomLevel
              );
            } else {
              resolve(false);
            }
          });
        },
        setViewport: (transform, options) => {
          return transformViewport(transform.x, transform.y, transform.zoom, options == null ? void 0 : options.duration);
        },
        setTransform: (transform, options) => {
          return transformViewport(transform.x, transform.y, transform.zoom, options == null ? void 0 : options.duration);
        },
        getViewport: () => ({
          x: state.viewport.x,
          y: state.viewport.y,
          zoom: state.viewport.zoom
        }),
        getTransform: () => {
          return {
            x: state.viewport.x,
            y: state.viewport.y,
            zoom: state.viewport.zoom
          };
        },
        fitView: (options = {
          padding: DEFAULT_PADDING,
          includeHiddenNodes: false,
          duration: 0
        }) => {
          const nodesToFit = state.nodes.filter((node) => {
            var _a;
            const isVisible = node.dimensions.width && node.dimensions.height && ((options == null ? void 0 : options.includeHiddenNodes) || !node.hidden);
            if ((_a = options.nodes) == null ? void 0 : _a.length) {
              return isVisible && options.nodes.includes(node.id);
            }
            return isVisible;
          });
          if (!nodesToFit.length) {
            return Promise.resolve(false);
          }
          const bounds = getRectOfNodes(nodesToFit);
          const { x, y, zoom: zoom22 } = getTransformForBounds(
            bounds,
            state.dimensions.width,
            state.dimensions.height,
            options.minZoom ?? state.minZoom,
            options.maxZoom ?? state.maxZoom,
            options.padding ?? DEFAULT_PADDING,
            options.offset
          );
          return transformViewport(x, y, zoom22, options == null ? void 0 : options.duration);
        },
        setCenter: (x, y, options) => {
          const nextZoom = typeof (options == null ? void 0 : options.zoom) !== "undefined" ? options.zoom : state.maxZoom;
          const centerX = state.dimensions.width / 2 - x * nextZoom;
          const centerY = state.dimensions.height / 2 - y * nextZoom;
          return transformViewport(centerX, centerY, nextZoom, options == null ? void 0 : options.duration);
        },
        fitBounds: (bounds, options = { padding: DEFAULT_PADDING }) => {
          const { x, y, zoom: zoom22 } = getTransformForBounds(
            bounds,
            state.dimensions.width,
            state.dimensions.height,
            state.minZoom,
            state.maxZoom,
            options.padding
          );
          return transformViewport(x, y, zoom22, options == null ? void 0 : options.duration);
        },
        project: (position) => pointToRendererPoint(position, state.viewport, state.snapToGrid, state.snapGrid),
        screenToFlowCoordinate: (position) => {
          if (state.vueFlowRef) {
            const { x: domX, y: domY } = state.vueFlowRef.getBoundingClientRect();
            const correctedPosition = {
              x: position.x - domX,
              y: position.y - domY
            };
            return pointToRendererPoint(correctedPosition, state.viewport, state.snapToGrid, state.snapGrid);
          }
          return { x: 0, y: 0 };
        },
        flowToScreenCoordinate: (position) => {
          if (state.vueFlowRef) {
            const { x: domX, y: domY } = state.vueFlowRef.getBoundingClientRect();
            const correctedPosition = {
              x: position.x + domX,
              y: position.y + domY
            };
            return rendererPointToPoint(correctedPosition, state.viewport);
          }
          return { x: 0, y: 0 };
        }
      };
    });
  }
  function transition(selection2, ms = 0, onEnd) {
    return selection2.transition().duration(ms).on("end", onEnd);
  }
  function useWatchProps(models, props, store) {
    const scope = vue.effectScope(true);
    scope.run(() => {
      const watchModelValue = () => {
        scope.run(() => {
          let pauseModel;
          let pauseStore;
          let immediateStore = !!(store.nodes.value.length || store.edges.value.length);
          pauseModel = watchPausable([models.modelValue, () => {
            var _a, _b;
            return (_b = (_a = models.modelValue) == null ? void 0 : _a.value) == null ? void 0 : _b.length;
          }], ([elements]) => {
            if (elements && Array.isArray(elements)) {
              pauseStore == null ? void 0 : pauseStore.pause();
              store.setElements(elements);
              if (!pauseStore && !immediateStore && elements.length) {
                immediateStore = true;
              } else {
                pauseStore == null ? void 0 : pauseStore.resume();
              }
            }
          });
          pauseStore = watchPausable(
            [store.nodes, store.edges, () => store.edges.value.length, () => store.nodes.value.length],
            ([nodes, edges]) => {
              var _a;
              if (((_a = models.modelValue) == null ? void 0 : _a.value) && Array.isArray(models.modelValue.value)) {
                pauseModel == null ? void 0 : pauseModel.pause();
                models.modelValue.value = [...nodes, ...edges];
                vue.nextTick(() => {
                  pauseModel == null ? void 0 : pauseModel.resume();
                });
              }
            },
            { immediate: immediateStore }
          );
          vue.onScopeDispose(() => {
            pauseModel == null ? void 0 : pauseModel.stop();
            pauseStore == null ? void 0 : pauseStore.stop();
          });
        });
      };
      const watchNodesValue = () => {
        scope.run(() => {
          let pauseModel;
          let pauseStore;
          let immediateStore = !!store.nodes.value.length;
          pauseModel = watchPausable([models.nodes, () => {
            var _a, _b;
            return (_b = (_a = models.nodes) == null ? void 0 : _a.value) == null ? void 0 : _b.length;
          }], ([nodes]) => {
            if (nodes && Array.isArray(nodes)) {
              pauseStore == null ? void 0 : pauseStore.pause();
              store.setNodes(nodes);
              if (!pauseStore && !immediateStore && nodes.length) {
                immediateStore = true;
              } else {
                pauseStore == null ? void 0 : pauseStore.resume();
              }
            }
          });
          pauseStore = watchPausable(
            [store.nodes, () => store.nodes.value.length],
            ([nodes]) => {
              var _a;
              if (((_a = models.nodes) == null ? void 0 : _a.value) && Array.isArray(models.nodes.value)) {
                pauseModel == null ? void 0 : pauseModel.pause();
                models.nodes.value = [...nodes];
                vue.nextTick(() => {
                  pauseModel == null ? void 0 : pauseModel.resume();
                });
              }
            },
            { immediate: immediateStore }
          );
          vue.onScopeDispose(() => {
            pauseModel == null ? void 0 : pauseModel.stop();
            pauseStore == null ? void 0 : pauseStore.stop();
          });
        });
      };
      const watchEdgesValue = () => {
        scope.run(() => {
          let pauseModel;
          let pauseStore;
          let immediateStore = !!store.edges.value.length;
          pauseModel = watchPausable([models.edges, () => {
            var _a, _b;
            return (_b = (_a = models.edges) == null ? void 0 : _a.value) == null ? void 0 : _b.length;
          }], ([edges]) => {
            if (edges && Array.isArray(edges)) {
              pauseStore == null ? void 0 : pauseStore.pause();
              store.setEdges(edges);
              if (!pauseStore && !immediateStore && edges.length) {
                immediateStore = true;
              } else {
                pauseStore == null ? void 0 : pauseStore.resume();
              }
            }
          });
          pauseStore = watchPausable(
            [store.edges, () => store.edges.value.length],
            ([edges]) => {
              var _a;
              if (((_a = models.edges) == null ? void 0 : _a.value) && Array.isArray(models.edges.value)) {
                pauseModel == null ? void 0 : pauseModel.pause();
                models.edges.value = [...edges];
                vue.nextTick(() => {
                  pauseModel == null ? void 0 : pauseModel.resume();
                });
              }
            },
            { immediate: immediateStore }
          );
          vue.onScopeDispose(() => {
            pauseModel == null ? void 0 : pauseModel.stop();
            pauseStore == null ? void 0 : pauseStore.stop();
          });
        });
      };
      const watchMaxZoom = () => {
        scope.run(() => {
          vue.watch(
            () => props.maxZoom,
            () => {
              if (props.maxZoom && isDef(props.maxZoom)) {
                store.setMaxZoom(props.maxZoom);
              }
            },
            {
              immediate: true
            }
          );
        });
      };
      const watchMinZoom = () => {
        scope.run(() => {
          vue.watch(
            () => props.minZoom,
            () => {
              if (props.minZoom && isDef(props.minZoom)) {
                store.setMinZoom(props.minZoom);
              }
            },
            { immediate: true }
          );
        });
      };
      const watchTranslateExtent = () => {
        scope.run(() => {
          vue.watch(
            () => props.translateExtent,
            () => {
              if (props.translateExtent && isDef(props.translateExtent)) {
                store.setTranslateExtent(props.translateExtent);
              }
            },
            {
              immediate: true
            }
          );
        });
      };
      const watchNodeExtent = () => {
        scope.run(() => {
          vue.watch(
            () => props.nodeExtent,
            () => {
              if (props.nodeExtent && isDef(props.nodeExtent)) {
                store.setNodeExtent(props.nodeExtent);
              }
            },
            {
              immediate: true
            }
          );
        });
      };
      const watchApplyDefault = () => {
        scope.run(() => {
          vue.watch(
            () => props.applyDefault,
            () => {
              if (isDef(props.applyDefault)) {
                store.applyDefault.value = props.applyDefault;
              }
            },
            {
              immediate: true
            }
          );
        });
      };
      const watchAutoConnect = () => {
        scope.run(() => {
          const autoConnector = async (params) => {
            let connection = params;
            if (typeof props.autoConnect === "function") {
              connection = await props.autoConnect(params);
            }
            if (connection !== false) {
              store.addEdges([connection]);
            }
          };
          vue.watch(
            () => props.autoConnect,
            () => {
              if (isDef(props.autoConnect)) {
                store.autoConnect.value = props.autoConnect;
              }
            },
            { immediate: true }
          );
          vue.watch(
            store.autoConnect,
            (autoConnectEnabled, _, onCleanup) => {
              if (autoConnectEnabled) {
                store.onConnect(autoConnector);
              } else {
                store.hooks.value.connect.off(autoConnector);
              }
              onCleanup(() => {
                store.hooks.value.connect.off(autoConnector);
              });
            },
            { immediate: true }
          );
        });
      };
      const watchRest = () => {
        const skip = [
          "id",
          "modelValue",
          "translateExtent",
          "nodeExtent",
          "edges",
          "nodes",
          "maxZoom",
          "minZoom",
          "applyDefault",
          "autoConnect"
        ];
        for (const key of Object.keys(props)) {
          const propKey = key;
          if (!skip.includes(propKey)) {
            const propValue = vue.toRef(() => props[propKey]);
            const storeRef = store[propKey];
            if (vue.isRef(storeRef)) {
              scope.run(() => {
                vue.watch(
                  propValue,
                  (nextValue) => {
                    if (isDef(nextValue)) {
                      storeRef.value = nextValue;
                    }
                  },
                  { immediate: true, flush: "pre" }
                );
              });
            }
          }
        }
      };
      const runAll = () => {
        watchModelValue();
        watchNodesValue();
        watchEdgesValue();
        watchMinZoom();
        watchMaxZoom();
        watchTranslateExtent();
        watchNodeExtent();
        watchApplyDefault();
        watchAutoConnect();
        watchRest();
      };
      runAll();
    });
    return () => scope.stop();
  }
  function useZoomPanHelper(vueFlowId) {
    const state = useVueFlow({ id: vueFlowId });
    const viewportHelper = useViewportHelper(toReactive(state));
    return {
      fitView: (params) => viewportHelper.value.fitView(params),
      zoomIn: (transitionOpts) => viewportHelper.value.zoomIn(transitionOpts),
      zoomOut: (transitionOpts) => viewportHelper.value.zoomOut(transitionOpts),
      zoomTo: (zoomLevel, transitionOpts) => viewportHelper.value.zoomTo(zoomLevel, transitionOpts),
      setViewport: (params, transitionOpts) => viewportHelper.value.setViewport(params, transitionOpts),
      setTransform: (params, transitionOpts) => viewportHelper.value.setTransform(params, transitionOpts),
      getViewport: () => viewportHelper.value.getViewport(),
      getTransform: () => viewportHelper.value.getTransform(),
      setCenter: (x, y, opts) => viewportHelper.value.setCenter(x, y, opts),
      fitBounds: (params, opts) => viewportHelper.value.fitBounds(params, opts),
      project: (params) => viewportHelper.value.project(params)
    };
  }
  function nodeToRect(node) {
    return {
      ...node.computedPosition || { x: 0, y: 0 },
      width: node.dimensions.width || 0,
      height: node.dimensions.height || 0
    };
  }
  function getOverlappingArea(rectA, rectB) {
    const xOverlap = Math.max(0, Math.min(rectA.x + rectA.width, rectB.x + rectB.width) - Math.max(rectA.x, rectB.x));
    const yOverlap = Math.max(0, Math.min(rectA.y + rectA.height, rectB.y + rectB.height) - Math.max(rectA.y, rectB.y));
    return Math.ceil(xOverlap * yOverlap);
  }
  function getDimensions(node) {
    return {
      width: node.offsetWidth,
      height: node.offsetHeight
    };
  }
  function clamp(val, min = 0, max = 1) {
    return Math.min(Math.max(val, min), max);
  }
  function clampPosition(position, extent) {
    return {
      x: clamp(position.x, extent[0][0], extent[1][0]),
      y: clamp(position.y, extent[0][1], extent[1][1])
    };
  }
  function getHostForElement(element) {
    const doc = element.getRootNode();
    if ("elementFromPoint" in doc) {
      return doc;
    }
    const window2 = useWindow();
    return window2.document;
  }
  function isEdge(element) {
    return element && typeof element === "object" && "id" in element && "source" in element && "target" in element;
  }
  function isGraphEdge(element) {
    return isEdge(element) && "sourceNode" in element && "targetNode" in element;
  }
  function isNode(element) {
    return element && typeof element === "object" && "id" in element && "position" in element && !isEdge(element);
  }
  function isGraphNode(element) {
    return isNode(element) && "computedPosition" in element;
  }
  function isNumeric(n) {
    return !Number.isNaN(n) && Number.isFinite(n);
  }
  function isRect(obj) {
    return isNumeric(obj.width) && isNumeric(obj.height) && isNumeric(obj.x) && isNumeric(obj.y);
  }
  function parseNode(node, existingNode, parentNode) {
    const initialState = {
      id: node.id.toString(),
      type: node.type ?? "default",
      dimensions: vue.markRaw({
        width: 0,
        height: 0
      }),
      handleBounds: {
        source: [],
        target: []
      },
      computedPosition: vue.markRaw({
        z: 0,
        ...node.position
      }),
      draggable: void 0,
      selectable: void 0,
      connectable: void 0,
      focusable: void 0,
      selected: false,
      dragging: false,
      resizing: false,
      initialized: false,
      isParent: false,
      position: {
        x: 0,
        y: 0
      },
      data: isDef(node.data) ? node.data : {},
      events: vue.markRaw(isDef(node.events) ? node.events : {})
    };
    return Object.assign(existingNode ?? initialState, node, { id: node.id.toString(), parentNode });
  }
  function parseEdge(edge, existingEdge, defaultEdgeOptions) {
    var _a, _b;
    const initialState = {
      id: edge.id.toString(),
      type: edge.type ?? (existingEdge == null ? void 0 : existingEdge.type) ?? "default",
      source: edge.source.toString(),
      target: edge.target.toString(),
      sourceHandle: (_a = edge.sourceHandle) == null ? void 0 : _a.toString(),
      targetHandle: (_b = edge.targetHandle) == null ? void 0 : _b.toString(),
      updatable: edge.updatable ?? (defaultEdgeOptions == null ? void 0 : defaultEdgeOptions.updatable),
      selectable: edge.selectable ?? (defaultEdgeOptions == null ? void 0 : defaultEdgeOptions.selectable),
      focusable: edge.focusable ?? (defaultEdgeOptions == null ? void 0 : defaultEdgeOptions.focusable),
      data: isDef(edge.data) ? edge.data : {},
      events: vue.markRaw(isDef(edge.events) ? edge.events : {}),
      label: edge.label ?? "",
      interactionWidth: edge.interactionWidth ?? (defaultEdgeOptions == null ? void 0 : defaultEdgeOptions.interactionWidth),
      ...defaultEdgeOptions ?? {}
    };
    return Object.assign(existingEdge ?? initialState, edge, { id: edge.id.toString() });
  }
  function getConnectedElements(nodeOrId, nodes, edges, dir) {
    const id2 = typeof nodeOrId === "string" ? nodeOrId : nodeOrId.id;
    const connectedIds = /* @__PURE__ */ new Set();
    const origin = dir === "source" ? "target" : "source";
    for (const edge of edges) {
      if (edge[origin] === id2) {
        connectedIds.add(edge[dir]);
      }
    }
    return nodes.filter((n) => connectedIds.has(n.id));
  }
  function getOutgoers(...args) {
    if (args.length === 3) {
      const [nodeOrId2, nodes, edges] = args;
      return getConnectedElements(nodeOrId2, nodes, edges, "target");
    }
    const [nodeOrId, elements] = args;
    const nodeId = typeof nodeOrId === "string" ? nodeOrId : nodeOrId.id;
    const outgoers = elements.filter((el) => isEdge(el) && el.source === nodeId);
    return outgoers.map((edge) => elements.find((el) => isNode(el) && el.id === edge.target));
  }
  function getIncomers(...args) {
    if (args.length === 3) {
      const [nodeOrId2, nodes, edges] = args;
      return getConnectedElements(nodeOrId2, nodes, edges, "source");
    }
    const [nodeOrId, elements] = args;
    const nodeId = typeof nodeOrId === "string" ? nodeOrId : nodeOrId.id;
    const incomers = elements.filter((el) => isEdge(el) && el.target === nodeId);
    return incomers.map((edge) => elements.find((el) => isNode(el) && el.id === edge.source));
  }
  function getEdgeId({ source, sourceHandle, target, targetHandle }) {
    return `vueflow__edge-${source}${sourceHandle ?? ""}-${target}${targetHandle ?? ""}`;
  }
  function connectionExists(edge, elements) {
    return elements.some(
      (el) => isEdge(el) && el.source === edge.source && el.target === edge.target && (el.sourceHandle === edge.sourceHandle || !el.sourceHandle && !edge.sourceHandle) && (el.targetHandle === edge.targetHandle || !el.targetHandle && !edge.targetHandle)
    );
  }
  function addEdge(edgeParams, elements, defaults) {
    if (!edgeParams.source || !edgeParams.target) {
      warn("Can't create edge. An edge needs a source and a target.");
      return elements;
    }
    let edge;
    if (isEdge(edgeParams)) {
      edge = { ...edgeParams };
    } else {
      edge = {
        ...edgeParams,
        id: getEdgeId(edgeParams)
      };
    }
    edge = parseEdge(edge, void 0, defaults);
    if (connectionExists(edge, elements)) {
      return elements;
    }
    elements.push(edge);
    return elements;
  }
  function updateEdge(oldEdge, newConnection, elements) {
    if (!newConnection.source || !newConnection.target) {
      warn("Can't create new edge. An edge needs a source and a target.");
      return elements;
    }
    const foundEdge = elements.find((e) => isEdge(e) && e.id === oldEdge.id);
    if (!foundEdge) {
      warn(`The old edge with id=${oldEdge.id} does not exist.`);
      return elements;
    }
    const edge = {
      ...oldEdge,
      id: getEdgeId(newConnection),
      source: newConnection.source,
      target: newConnection.target,
      sourceHandle: newConnection.sourceHandle,
      targetHandle: newConnection.targetHandle
    };
    elements.splice(elements.indexOf(foundEdge), 1, edge);
    return elements.filter((e) => e.id !== oldEdge.id);
  }
  function rendererPointToPoint({ x, y }, { x: tx, y: ty, zoom: tScale }) {
    return {
      x: x * tScale + tx,
      y: y * tScale + ty
    };
  }
  function pointToRendererPoint({ x, y }, { x: tx, y: ty, zoom: tScale }, snapToGrid, [snapX, snapY]) {
    const position = {
      x: (x - tx) / tScale,
      y: (y - ty) / tScale
    };
    if (snapToGrid) {
      return {
        x: snapX * Math.round(position.x / snapX),
        y: snapY * Math.round(position.y / snapY)
      };
    }
    return position;
  }
  function getBoundsOfBoxes(box1, box2) {
    return {
      x: Math.min(box1.x, box2.x),
      y: Math.min(box1.y, box2.y),
      x2: Math.max(box1.x2, box2.x2),
      y2: Math.max(box1.y2, box2.y2)
    };
  }
  function rectToBox({ x, y, width, height }) {
    return {
      x,
      y,
      x2: x + width,
      y2: y + height
    };
  }
  function boxToRect({ x, y, x2, y2 }) {
    return {
      x,
      y,
      width: x2 - x,
      height: y2 - y
    };
  }
  function getBoundsofRects(rect1, rect2) {
    return boxToRect(getBoundsOfBoxes(rectToBox(rect1), rectToBox(rect2)));
  }
  function getRectOfNodes(nodes) {
    const box = nodes.reduce(
      (currBox, { computedPosition = { x: 0, y: 0 }, dimensions = { width: 0, height: 0 } } = {}) => getBoundsOfBoxes(
        currBox,
        rectToBox({
          ...computedPosition,
          ...dimensions
        })
      ),
      { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, x2: Number.NEGATIVE_INFINITY, y2: Number.NEGATIVE_INFINITY }
    );
    return boxToRect(box);
  }
  function getNodesInside(nodes, rect, { x: tx, y: ty, zoom: tScale } = { x: 0, y: 0, zoom: 1 }, partially = false, excludeNonSelectableNodes = false) {
    const paneRect = {
      x: (rect.x - tx) / tScale,
      y: (rect.y - ty) / tScale,
      width: rect.width / tScale,
      height: rect.height / tScale
    };
    return nodes.filter((node) => {
      const { computedPosition = { x: 0, y: 0 }, dimensions = { width: 0, height: 0 }, selectable } = node;
      if (excludeNonSelectableNodes && !selectable) {
        return false;
      }
      const nodeRect = { ...computedPosition, width: dimensions.width || 0, height: dimensions.height || 0 };
      const overlappingArea = getOverlappingArea(paneRect, nodeRect);
      const notInitialized = typeof dimensions.width === "undefined" || typeof dimensions.height === "undefined" || dimensions.width === 0 || dimensions.height === 0;
      const partiallyVisible = partially && overlappingArea > 0;
      const area = dimensions.width * dimensions.height;
      return notInitialized || partiallyVisible || overlappingArea >= area;
    });
  }
  function getConnectedEdges(nodesOrId, edges) {
    const nodeIds = /* @__PURE__ */ new Set();
    if (typeof nodesOrId === "string") {
      nodeIds.add(nodesOrId);
    } else if (nodesOrId.length >= 1) {
      for (const n of nodesOrId) {
        nodeIds.add(n.id);
      }
    }
    return edges.filter((edge) => nodeIds.has(edge.source) || nodeIds.has(edge.target));
  }
  function getTransformForBounds(bounds, width, height, minZoom, maxZoom, padding = 0.1, offset = { x: 0, y: 0 }) {
    const xZoom = width / (bounds.width * (1 + padding));
    const yZoom = height / (bounds.height * (1 + padding));
    const zoom2 = Math.min(xZoom, yZoom);
    const clampedZoom = clamp(zoom2, minZoom, maxZoom);
    const boundsCenterX = bounds.x + bounds.width / 2;
    const boundsCenterY = bounds.y + bounds.height / 2;
    const x = width / 2 - boundsCenterX * clampedZoom + (offset.x ?? 0);
    const y = height / 2 - boundsCenterY * clampedZoom + (offset.y ?? 0);
    return { x, y, zoom: clampedZoom };
  }
  function getXYZPos(parentPos, computedPosition) {
    return {
      x: computedPosition.x + parentPos.x,
      y: computedPosition.y + parentPos.y,
      z: (parentPos.z > computedPosition.z ? parentPos.z : computedPosition.z) + 1
    };
  }
  function isParentSelected(node, findNode) {
    if (!node.parentNode) {
      return false;
    }
    const parent = findNode(node.parentNode);
    if (!parent) {
      return false;
    }
    if (parent.selected) {
      return true;
    }
    return isParentSelected(parent, findNode);
  }
  function getMarkerId(marker, vueFlowId) {
    if (typeof marker === "undefined") {
      return "";
    }
    if (typeof marker === "string") {
      return marker;
    }
    const idPrefix = vueFlowId ? `${vueFlowId}__` : "";
    return `${idPrefix}${Object.keys(marker).sort().map((key) => `${key}=${marker[key]}`).join("&")}`;
  }
  function calcAutoPanVelocity(value, min, max) {
    if (value < min) {
      return clamp(Math.abs(value - min), 1, 50) / 50;
    } else if (value > max) {
      return -clamp(Math.abs(value - max), 1, 50) / 50;
    }
    return 0;
  }
  function calcAutoPan(pos, bounds) {
    const xMovement = calcAutoPanVelocity(pos.x, 35, bounds.width - 35) * 20;
    const yMovement = calcAutoPanVelocity(pos.y, 35, bounds.height - 35) * 20;
    return [xMovement, yMovement];
  }
  function handleParentExpand(updateItem, parent) {
    if (parent) {
      const extendWidth = updateItem.position.x + updateItem.dimensions.width - parent.dimensions.width;
      const extendHeight = updateItem.position.y + updateItem.dimensions.height - parent.dimensions.height;
      if (extendWidth > 0 || extendHeight > 0 || updateItem.position.x < 0 || updateItem.position.y < 0) {
        let parentStyles = {};
        if (typeof parent.style === "function") {
          parentStyles = { ...parent.style(parent) };
        } else if (parent.style) {
          parentStyles = { ...parent.style };
        }
        parentStyles.width = parentStyles.width ?? `${parent.dimensions.width}px`;
        parentStyles.height = parentStyles.height ?? `${parent.dimensions.height}px`;
        if (extendWidth > 0) {
          if (typeof parentStyles.width === "string") {
            const currWidth = Number(parentStyles.width.replace("px", ""));
            parentStyles.width = `${currWidth + extendWidth}px`;
          } else {
            parentStyles.width += extendWidth;
          }
        }
        if (extendHeight > 0) {
          if (typeof parentStyles.height === "string") {
            const currWidth = Number(parentStyles.height.replace("px", ""));
            parentStyles.height = `${currWidth + extendHeight}px`;
          } else {
            parentStyles.height += extendHeight;
          }
        }
        if (updateItem.position.x < 0) {
          const xDiff = Math.abs(updateItem.position.x);
          parent.position.x = parent.position.x - xDiff;
          if (typeof parentStyles.width === "string") {
            const currWidth = Number(parentStyles.width.replace("px", ""));
            parentStyles.width = `${currWidth + xDiff}px`;
          } else {
            parentStyles.width += xDiff;
          }
          updateItem.position.x = 0;
        }
        if (updateItem.position.y < 0) {
          const yDiff = Math.abs(updateItem.position.y);
          parent.position.y = parent.position.y - yDiff;
          if (typeof parentStyles.height === "string") {
            const currWidth = Number(parentStyles.height.replace("px", ""));
            parentStyles.height = `${currWidth + yDiff}px`;
          } else {
            parentStyles.height += yDiff;
          }
          updateItem.position.y = 0;
        }
        parent.dimensions.width = Number(parentStyles.width.toString().replace("px", ""));
        parent.dimensions.height = Number(parentStyles.height.toString().replace("px", ""));
        if (typeof parent.style === "function") {
          parent.style = (p) => {
            const styleFunc = parent.style;
            return {
              ...styleFunc(p),
              ...parentStyles
            };
          };
        } else {
          parent.style = {
            ...parent.style,
            ...parentStyles
          };
        }
      }
    }
  }
  function applyChanges(changes, elements) {
    var _a, _b;
    const addRemoveChanges = changes.filter((c) => c.type === "add" || c.type === "remove");
    for (const change of addRemoveChanges) {
      if (change.type === "add") {
        const index = elements.findIndex((el) => el.id === change.item.id);
        if (index === -1) {
          elements.push(change.item);
        }
      } else if (change.type === "remove") {
        const index = elements.findIndex((el) => el.id === change.id);
        if (index !== -1) {
          elements.splice(index, 1);
        }
      }
    }
    const elementIds = elements.map((el) => el.id);
    for (const element of elements) {
      const currentChanges = changes.filter((c) => c.id === element.id);
      for (const currentChange of currentChanges) {
        switch (currentChange.type) {
          case "select":
            element.selected = currentChange.selected;
            break;
          case "position":
            if (isGraphNode(element)) {
              if (typeof currentChange.position !== "undefined") {
                element.position = currentChange.position;
              }
              if (typeof currentChange.dragging !== "undefined") {
                element.dragging = currentChange.dragging;
              }
              if (element.expandParent && element.parentNode) {
                const parent = elements[elementIds.indexOf(element.parentNode)];
                if (parent && isGraphNode(parent)) {
                  handleParentExpand(element, parent);
                }
              }
            }
            break;
          case "dimensions":
            if (isGraphNode(element)) {
              if (typeof currentChange.dimensions !== "undefined") {
                element.dimensions = currentChange.dimensions;
              }
              if (typeof currentChange.updateStyle !== "undefined") {
                element.style = {
                  ...element.style || {},
                  width: `${(_a = currentChange.dimensions) == null ? void 0 : _a.width}px`,
                  height: `${(_b = currentChange.dimensions) == null ? void 0 : _b.height}px`
                };
              }
              if (typeof currentChange.resizing !== "undefined") {
                element.resizing = currentChange.resizing;
              }
              if (element.expandParent && element.parentNode) {
                const parent = elements[elementIds.indexOf(element.parentNode)];
                if (parent && isGraphNode(parent)) {
                  if (!parent.initialized) {
                    vue.nextTick(() => {
                      handleParentExpand(element, parent);
                    });
                  } else {
                    handleParentExpand(element, parent);
                  }
                }
              }
              if (!element.initialized) {
                element.initialized = true;
              }
            }
            break;
        }
      }
    }
    return elements;
  }
  function applyEdgeChanges(changes, edges) {
    return applyChanges(changes, edges);
  }
  function applyNodeChanges(changes, nodes) {
    return applyChanges(changes, nodes);
  }
  function createSelectionChange(id2, selected) {
    return {
      id: id2,
      type: "select",
      selected
    };
  }
  function createAdditionChange(item) {
    return {
      item,
      type: "add"
    };
  }
  function createNodeRemoveChange(id2) {
    return {
      id: id2,
      type: "remove"
    };
  }
  function createEdgeRemoveChange(id2, source, target, sourceHandle, targetHandle) {
    return {
      id: id2,
      source,
      target,
      sourceHandle: sourceHandle || null,
      targetHandle: targetHandle || null,
      type: "remove"
    };
  }
  function getSelectionChanges(elements, selectedIds) {
    return elements.reduce(
      (res, item) => {
        let willBeSelected = selectedIds.includes(item.id);
        if (isDef(item.selectable) && !item.selectable) {
          willBeSelected = false;
        }
        const key = isGraphNode(item) ? "changedNodes" : "changedEdges";
        if (!item.selected && willBeSelected) {
          res[key].push(createSelectionChange(item.id, true));
        } else if (item.selected && !willBeSelected) {
          res[key].push(createSelectionChange(item.id, false));
        }
        return res;
      },
      { changedNodes: [], changedEdges: [] }
    );
  }
  function createExtendedEventHook(defaultHandler) {
    const fns = /* @__PURE__ */ new Set();
    let hasDefaultHandler = false;
    const hasListeners = () => fns.size > 0;
    if (defaultHandler) {
      hasDefaultHandler = true;
      fns.add(defaultHandler);
    }
    const off = (fn) => {
      fns.delete(fn);
    };
    const on = (fn) => {
      if (defaultHandler && hasDefaultHandler) {
        fns.delete(defaultHandler);
      }
      fns.add(fn);
      const offFn = () => {
        off(fn);
        if (defaultHandler && hasDefaultHandler) {
          fns.add(defaultHandler);
        }
      };
      tryOnScopeDispose(offFn);
      return {
        off: offFn
      };
    };
    const trigger = (param) => {
      return Promise.all(Array.from(fns).map((fn) => fn(param)));
    };
    return {
      on,
      off,
      trigger,
      hasListeners,
      fns
    };
  }
  function hasSelector(target, selector2, node) {
    let current = target;
    do {
      if (current && current.matches(selector2)) {
        return true;
      } else if (current === node) {
        return false;
      }
      current = current.parentElement;
    } while (current);
    return false;
  }
  function getDragItems(nodes, nodesDraggable, mousePos, findNode, nodeId) {
    return nodes.filter(
      (n) => (n.selected || n.id === nodeId) && (!n.parentNode || !isParentSelected(n, findNode)) && (n.draggable || nodesDraggable && typeof n.draggable === "undefined")
    ).map(
      (n) => {
        var _a, _b;
        return vue.markRaw({
          id: n.id,
          position: n.position || { x: 0, y: 0 },
          distance: {
            x: mousePos.x - ((_a = n.computedPosition) == null ? void 0 : _a.x) || 0,
            y: mousePos.y - ((_b = n.computedPosition) == null ? void 0 : _b.y) || 0
          },
          from: n.computedPosition,
          extent: n.extent,
          parentNode: n.parentNode,
          dimensions: n.dimensions,
          expandParent: n.expandParent
        });
      }
    );
  }
  function getEventHandlerParams({
    id: id2,
    dragItems,
    findNode
  }) {
    const extendedDragItems = dragItems.reduce((acc, dragItem) => {
      const node = findNode(dragItem.id);
      if (node) {
        acc.push(node);
      }
      return acc;
    }, []);
    return [id2 ? extendedDragItems.find((n) => n.id === id2) : extendedDragItems[0], extendedDragItems];
  }
  function getExtentPadding(padding) {
    if (Array.isArray(padding)) {
      switch (padding.length) {
        case 1:
          return [padding[0], padding[0], padding[0], padding[0]];
        case 2:
          return [padding[0], padding[1], padding[0], padding[1]];
        case 3:
          return [padding[0], padding[1], padding[2], padding[1]];
        case 4:
          return padding;
        default:
          return [0, 0, 0, 0];
      }
    }
    return [padding, padding, padding, padding];
  }
  function getParentExtent(currentExtent, node, parent) {
    const [top, right, bottom, left] = typeof currentExtent !== "string" ? getExtentPadding(currentExtent.padding) : [0, 0, 0, 0];
    if (parent && typeof parent.computedPosition.x !== "undefined" && typeof parent.computedPosition.y !== "undefined" && typeof parent.dimensions.width !== "undefined" && typeof parent.dimensions.height !== "undefined") {
      return [
        [parent.computedPosition.x + left, parent.computedPosition.y + top],
        [
          parent.computedPosition.x + parent.dimensions.width - right,
          parent.computedPosition.y + parent.dimensions.height - bottom
        ]
      ];
    }
    return false;
  }
  function getExtent(item, triggerError, extent, parent) {
    let currentExtent = item.extent || extent;
    if ((currentExtent === "parent" || !Array.isArray(currentExtent) && (currentExtent == null ? void 0 : currentExtent.range) === "parent") && !item.expandParent) {
      if (item.parentNode && parent && item.dimensions.width && item.dimensions.height) {
        const parentExtent = getParentExtent(currentExtent, item, parent);
        if (parentExtent) {
          currentExtent = parentExtent;
        }
      } else {
        triggerError(new VueFlowError(ErrorCode.NODE_EXTENT_INVALID, item.id));
        currentExtent = extent;
      }
    } else if (Array.isArray(currentExtent)) {
      const parentX = (parent == null ? void 0 : parent.computedPosition.x) || 0;
      const parentY = (parent == null ? void 0 : parent.computedPosition.y) || 0;
      currentExtent = [
        [currentExtent[0][0] + parentX, currentExtent[0][1] + parentY],
        [currentExtent[1][0] + parentX, currentExtent[1][1] + parentY]
      ];
    } else if (currentExtent !== "parent" && (currentExtent == null ? void 0 : currentExtent.range) && Array.isArray(currentExtent.range)) {
      const [top, right, bottom, left] = getExtentPadding(currentExtent.padding);
      const parentX = (parent == null ? void 0 : parent.computedPosition.x) || 0;
      const parentY = (parent == null ? void 0 : parent.computedPosition.y) || 0;
      currentExtent = [
        [currentExtent.range[0][0] + parentX + left, currentExtent.range[0][1] + parentY + top],
        [currentExtent.range[1][0] + parentX - right, currentExtent.range[1][1] + parentY - bottom]
      ];
    }
    return currentExtent === "parent" ? [
      [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
      [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
    ] : currentExtent;
  }
  function clampNodeExtent({ width, height }, extent) {
    return [extent[0], [extent[1][0] - (width || 0), extent[1][1] - (height || 0)]];
  }
  function calcNextPosition(node, nextPosition, triggerError, nodeExtent, parentNode) {
    const extent = clampNodeExtent(node.dimensions, getExtent(node, triggerError, nodeExtent, parentNode));
    const clampedPos = clampPosition(nextPosition, extent);
    return {
      position: {
        x: clampedPos.x - ((parentNode == null ? void 0 : parentNode.computedPosition.x) || 0),
        y: clampedPos.y - ((parentNode == null ? void 0 : parentNode.computedPosition.y) || 0)
      },
      computedPosition: clampedPos
    };
  }
  function getHandlePosition(position, rect, handle) {
    const x = ((handle == null ? void 0 : handle.x) ?? 0) + rect.x;
    const y = ((handle == null ? void 0 : handle.y) ?? 0) + rect.y;
    const width = (handle == null ? void 0 : handle.width) ?? rect.width;
    const height = (handle == null ? void 0 : handle.height) ?? rect.height;
    switch (position) {
      case Position.Top:
        return {
          x: x + width / 2,
          y
        };
      case Position.Right:
        return {
          x: x + width,
          y: y + height / 2
        };
      case Position.Bottom:
        return {
          x: x + width / 2,
          y: y + height
        };
      case Position.Left:
        return {
          x,
          y: y + height / 2
        };
    }
  }
  function getHandle(bounds = [], handleId) {
    if (!bounds.length) {
      return null;
    }
    return (!handleId ? bounds[0] : bounds.find((d) => d.id === handleId)) || null;
  }
  function getEdgePositions(sourceNode, sourceHandle, sourcePosition, targetNode, targetHandle, targetPosition) {
    const sourceHandlePos = getHandlePosition(
      sourcePosition,
      {
        ...sourceNode.dimensions,
        ...sourceNode.computedPosition
      },
      sourceHandle
    );
    const targetHandlePos = getHandlePosition(
      targetPosition,
      {
        ...targetNode.dimensions,
        ...targetNode.computedPosition
      },
      targetHandle
    );
    return {
      sourceX: sourceHandlePos.x,
      sourceY: sourceHandlePos.y,
      targetX: targetHandlePos.x,
      targetY: targetHandlePos.y
    };
  }
  function isEdgeVisible({
    sourcePos,
    targetPos,
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    width,
    height,
    viewport
  }) {
    const edgeBox = {
      x: Math.min(sourcePos.x, targetPos.x),
      y: Math.min(sourcePos.y, targetPos.y),
      x2: Math.max(sourcePos.x + sourceWidth, targetPos.x + targetWidth),
      y2: Math.max(sourcePos.y + sourceHeight, targetPos.y + targetHeight)
    };
    if (edgeBox.x === edgeBox.x2) {
      edgeBox.x2 += 1;
    }
    if (edgeBox.y === edgeBox.y2) {
      edgeBox.y2 += 1;
    }
    const viewBox = rectToBox({
      x: (0 - viewport.x) / viewport.zoom,
      y: (0 - viewport.y) / viewport.zoom,
      width: width / viewport.zoom,
      height: height / viewport.zoom
    });
    const xOverlap = Math.max(0, Math.min(viewBox.x2, edgeBox.x2) - Math.max(viewBox.x, edgeBox.x));
    const yOverlap = Math.max(0, Math.min(viewBox.y2, edgeBox.y2) - Math.max(viewBox.y, edgeBox.y));
    const overlappingArea = Math.ceil(xOverlap * yOverlap);
    return overlappingArea > 0;
  }
  function getEdgeZIndex(edge, findNode, elevateEdgesOnSelect = false) {
    const hasZIndex = typeof edge.zIndex === "number";
    let z = hasZIndex ? edge.zIndex : 0;
    const source = findNode(edge.source);
    const target = findNode(edge.target);
    if (!source || !target) {
      return 0;
    }
    if (elevateEdgesOnSelect) {
      z = hasZIndex ? edge.zIndex : Math.max(source.computedPosition.z || 0, target.computedPosition.z || 0);
    }
    return z;
  }
  var ErrorCode = /* @__PURE__ */ ((ErrorCode2) => {
    ErrorCode2["MISSING_VIEWPORT_DIMENSIONS"] = "MISSING_VIEWPORT_DIMENSIONS";
    ErrorCode2["NODE_INVALID"] = "NODE_INVALID";
    ErrorCode2["NODE_NOT_FOUND"] = "NODE_NOT_FOUND";
    ErrorCode2["NODE_MISSING_PARENT"] = "NODE_MISSING_PARENT";
    ErrorCode2["NODE_TYPE_MISSING"] = "NODE_TYPE_MISSING";
    ErrorCode2["NODE_EXTENT_INVALID"] = "NODE_EXTENT_INVALID";
    ErrorCode2["EDGE_INVALID"] = "EDGE_INVALID";
    ErrorCode2["EDGE_NOT_FOUND"] = "EDGE_NOT_FOUND";
    ErrorCode2["EDGE_SOURCE_MISSING"] = "EDGE_SOURCE_MISSING";
    ErrorCode2["EDGE_TARGET_MISSING"] = "EDGE_TARGET_MISSING";
    ErrorCode2["EDGE_TYPE_MISSING"] = "EDGE_TYPE_MISSING";
    ErrorCode2["EDGE_SOURCE_TARGET_SAME"] = "EDGE_SOURCE_TARGET_SAME";
    ErrorCode2["EDGE_SOURCE_TARGET_MISSING"] = "EDGE_SOURCE_TARGET_MISSING";
    ErrorCode2["EDGE_ORPHANED"] = "EDGE_ORPHANED";
    return ErrorCode2;
  })(ErrorCode || {});
  const messages = {
    [
      "MISSING_VIEWPORT_DIMENSIONS"
      /* MISSING_VIEWPORT_DIMENSIONS */
    ]: () => "The Vue Flow parent container needs a width and a height to render the graph",
    [
      "NODE_INVALID"
      /* NODE_INVALID */
    ]: (id2) => `Node is invalid
Node: ${id2}`,
    [
      "NODE_NOT_FOUND"
      /* NODE_NOT_FOUND */
    ]: (id2) => `Node not found
Node: ${id2}`,
    [
      "NODE_MISSING_PARENT"
      /* NODE_MISSING_PARENT */
    ]: (id2, parentId) => `Node is missing a parent
Node: ${id2}
Parent: ${parentId}`,
    [
      "NODE_TYPE_MISSING"
      /* NODE_TYPE_MISSING */
    ]: (type) => `Node type is missing
Type: ${type}`,
    [
      "NODE_EXTENT_INVALID"
      /* NODE_EXTENT_INVALID */
    ]: (id2) => `Only child nodes can use a parent extent
Node: ${id2}`,
    [
      "EDGE_INVALID"
      /* EDGE_INVALID */
    ]: (id2) => `An edge needs a source and a target
Edge: ${id2}`,
    [
      "EDGE_SOURCE_MISSING"
      /* EDGE_SOURCE_MISSING */
    ]: (id2, source) => `Edge source is missing
Edge: ${id2} 
Source: ${source}`,
    [
      "EDGE_TARGET_MISSING"
      /* EDGE_TARGET_MISSING */
    ]: (id2, target) => `Edge target is missing
Edge: ${id2} 
Target: ${target}`,
    [
      "EDGE_TYPE_MISSING"
      /* EDGE_TYPE_MISSING */
    ]: (type) => `Edge type is missing
Type: ${type}`,
    [
      "EDGE_SOURCE_TARGET_SAME"
      /* EDGE_SOURCE_TARGET_SAME */
    ]: (id2, source, target) => `Edge source and target are the same
Edge: ${id2} 
Source: ${source} 
Target: ${target}`,
    [
      "EDGE_SOURCE_TARGET_MISSING"
      /* EDGE_SOURCE_TARGET_MISSING */
    ]: (id2, source, target) => `Edge source or target is missing
Edge: ${id2} 
Source: ${source} 
Target: ${target}`,
    [
      "EDGE_ORPHANED"
      /* EDGE_ORPHANED */
    ]: (id2) => `Edge was orphaned (suddenly missing source or target) and has been removed
Edge: ${id2}`,
    [
      "EDGE_NOT_FOUND"
      /* EDGE_NOT_FOUND */
    ]: (id2) => `Edge not found
Edge: ${id2}`
  };
  class VueFlowError extends Error {
    constructor(code, ...args) {
      var _a;
      super((_a = messages[code]) == null ? void 0 : _a.call(messages, ...args));
      this.name = "VueFlowError";
      this.code = code;
      this.args = args;
    }
  }
  function isErrorOfType(error, code) {
    return error.code === code;
  }
  function isMouseEvent(event) {
    return "clientX" in event;
  }
  function getEventPosition(event, bounds) {
    var _a, _b;
    const isMouseTriggered = isMouseEvent(event);
    const evtX = isMouseTriggered ? event.clientX : (_a = event.touches) == null ? void 0 : _a[0].clientX;
    const evtY = isMouseTriggered ? event.clientY : (_b = event.touches) == null ? void 0 : _b[0].clientY;
    return {
      x: evtX - ((bounds == null ? void 0 : bounds.left) ?? 0),
      y: evtY - ((bounds == null ? void 0 : bounds.top) ?? 0)
    };
  }
  const isMacOs = () => {
    var _a;
    return typeof navigator !== "undefined" && ((_a = navigator == null ? void 0 : navigator.userAgent) == null ? void 0 : _a.indexOf("Mac")) >= 0;
  };
  function defaultValidHandleResult() {
    return {
      handleDomNode: null,
      isValid: false,
      connection: { source: "", target: "", sourceHandle: null, targetHandle: null },
      endHandle: null
    };
  }
  function resetRecentHandle(handleDomNode) {
    handleDomNode == null ? void 0 : handleDomNode.classList.remove("valid", "connecting", "vue-flow__handle-valid", "vue-flow__handle-connecting");
  }
  function getHandles(node, handleBounds, type, currentHandle) {
    return (handleBounds[type] || []).reduce((res, h) => {
      var _a, _b;
      if (`${node.id}-${h.id}-${type}` !== currentHandle) {
        res.push({
          id: h.id || null,
          type,
          nodeId: node.id,
          x: (((_a = node.computedPosition) == null ? void 0 : _a.x) ?? 0) + h.x + h.width / 2,
          y: (((_b = node.computedPosition) == null ? void 0 : _b.y) ?? 0) + h.y + h.height / 2,
          width: h.width,
          height: h.height
        });
      }
      return res;
    }, []);
  }
  function getClosestHandle(event, doc, pos, connectionRadius, handles, validator) {
    const { x, y } = getEventPosition(event);
    const domNodes = doc.elementsFromPoint(x, y);
    const handleBelow = domNodes.find((el) => el.classList.contains("vue-flow__handle"));
    if (handleBelow) {
      const handleNodeId = handleBelow.getAttribute("data-nodeid");
      if (handleNodeId) {
        const handleType = getHandleType(void 0, handleBelow);
        const handleId = handleBelow.getAttribute("data-handleid");
        const validHandleResult = validator({ nodeId: handleNodeId, id: handleId, type: handleType });
        if (validHandleResult) {
          const handle = handles.find((h) => h.nodeId === handleNodeId && h.type === handleType && h.id === handleId);
          return {
            handle: {
              id: handleId,
              type: handleType,
              nodeId: handleNodeId,
              x: (handle == null ? void 0 : handle.x) || pos.x,
              y: (handle == null ? void 0 : handle.y) || pos.y
            },
            validHandleResult
          };
        }
      }
    }
    let closestHandles = [];
    let minDistance = Number.POSITIVE_INFINITY;
    for (const handle of handles) {
      const distance2 = Math.sqrt((handle.x - pos.x) ** 2 + (handle.y - pos.y) ** 2);
      if (distance2 <= connectionRadius) {
        const validHandleResult = validator(handle);
        if (distance2 <= minDistance) {
          if (distance2 < minDistance) {
            closestHandles = [{ handle, validHandleResult }];
          } else if (distance2 === minDistance) {
            closestHandles.push({
              handle,
              validHandleResult
            });
          }
          minDistance = distance2;
        }
      }
    }
    if (!closestHandles.length) {
      return { handle: null, validHandleResult: defaultValidHandleResult() };
    }
    if (closestHandles.length === 1) {
      return closestHandles[0];
    }
    const hasValidHandle = closestHandles.some(({ validHandleResult }) => validHandleResult.isValid);
    const hasTargetHandle = closestHandles.some(({ handle }) => handle.type === "target");
    return closestHandles.find(
      ({ handle, validHandleResult }) => hasTargetHandle ? handle.type === "target" : hasValidHandle ? validHandleResult.isValid : true
    ) || closestHandles[0];
  }
  function isValidHandle(event, handle, connectionMode, fromNodeId, fromHandleId, fromType, isValidConnection, doc, edges, nodes, findNode) {
    const isTarget = fromType === "target";
    const handleDomNode = doc.querySelector(`.vue-flow__handle[data-id="${handle == null ? void 0 : handle.nodeId}-${handle == null ? void 0 : handle.id}-${handle == null ? void 0 : handle.type}"]`);
    const { x, y } = getEventPosition(event);
    const elementBelow = doc.elementFromPoint(x, y);
    const handleToCheck = (elementBelow == null ? void 0 : elementBelow.classList.contains("vue-flow__handle")) ? elementBelow : handleDomNode;
    const result = defaultValidHandleResult();
    if (handleToCheck) {
      result.handleDomNode = handleToCheck;
      const handleType = getHandleType(void 0, handleToCheck);
      const handleNodeId = handleToCheck.getAttribute("data-nodeid");
      const handleId = handleToCheck.getAttribute("data-handleid");
      const connectable = handleToCheck.classList.contains("connectable");
      const connectableEnd = handleToCheck.classList.contains("connectableend");
      const connection = {
        source: isTarget ? handleNodeId : fromNodeId,
        sourceHandle: isTarget ? handleId : fromHandleId,
        target: isTarget ? fromNodeId : handleNodeId,
        targetHandle: isTarget ? fromHandleId : handleId
      };
      result.connection = connection;
      const isConnectable = connectable && connectableEnd;
      const isValid = isConnectable && (connectionMode === ConnectionMode.Strict ? isTarget && handleType === "source" || !isTarget && handleType === "target" : handleNodeId !== fromNodeId || handleId !== fromHandleId);
      result.endHandle = {
        nodeId: handleNodeId,
        handleId,
        type: handleType
      };
      if (isValid) {
        result.isValid = isValidConnection(connection, {
          edges,
          nodes,
          sourceNode: findNode(connection.source),
          targetNode: findNode(connection.target)
        });
      }
    }
    return result;
  }
  function getHandleLookup({ nodes, nodeId, handleId, handleType }) {
    return nodes.reduce((res, node) => {
      const { handleBounds } = node;
      let sourceHandles = [];
      let targetHandles = [];
      if (handleBounds) {
        sourceHandles = getHandles(node, handleBounds, "source", `${nodeId}-${handleId}-${handleType}`);
        targetHandles = getHandles(node, handleBounds, "target", `${nodeId}-${handleId}-${handleType}`);
      }
      res.push(...sourceHandles, ...targetHandles);
      return res;
    }, []);
  }
  function getHandleType(edgeUpdaterType, handleDomNode) {
    if (edgeUpdaterType) {
      return edgeUpdaterType;
    } else if (handleDomNode == null ? void 0 : handleDomNode.classList.contains("target")) {
      return "target";
    } else if (handleDomNode == null ? void 0 : handleDomNode.classList.contains("source")) {
      return "source";
    }
    return null;
  }
  function getConnectionStatus(isInsideConnectionRadius, isHandleValid) {
    let connectionStatus = null;
    if (isHandleValid) {
      connectionStatus = "valid";
    } else if (isInsideConnectionRadius && !isHandleValid) {
      connectionStatus = "invalid";
    }
    return connectionStatus;
  }
  const productionEnvs = ["production", "prod"];
  function warn(message, ...args) {
    if (!productionEnvs.includes(production || "")) {
      console.warn(`[Vue Flow]: ${message}`, ...args);
    }
  }
  function getHandleBounds(selector2, nodeElement, zoom2) {
    const handles = nodeElement.querySelectorAll(`.vue-flow__handle${selector2}`);
    if (!handles || !handles.length) {
      return void 0;
    }
    const handlesArray = Array.from(handles);
    const nodeBounds = nodeElement.getBoundingClientRect();
    return handlesArray.map((handle) => {
      const handleBounds = handle.getBoundingClientRect();
      return {
        id: handle.getAttribute("data-handleid"),
        position: handle.getAttribute("data-handlepos"),
        x: (handleBounds.left - nodeBounds.left) / zoom2,
        y: (handleBounds.top - nodeBounds.top) / zoom2,
        ...getDimensions(handle)
      };
    });
  }
  function handleNodeClick(node, multiSelectionActive, addSelectedNodes, removeSelectedNodes, nodesSelectionActive, unselect = false, nodeEl) {
    nodesSelectionActive.value = false;
    if (!node.selected) {
      addSelectedNodes([node]);
    } else if (unselect || node.selected && multiSelectionActive) {
      removeSelectedNodes([node]);
      vue.nextTick(() => {
        nodeEl.blur();
      });
    }
  }
  function isDef(val) {
    const unrefVal = vue.unref(val);
    return typeof unrefVal !== "undefined";
  }
  function addEdgeToStore(edgeParams, edges, triggerError, defaultEdgeOptions) {
    if (!edgeParams || !edgeParams.source || !edgeParams.target) {
      triggerError(new VueFlowError(ErrorCode.EDGE_INVALID, (edgeParams == null ? void 0 : edgeParams.id) ?? `[ID UNKNOWN]`));
      return false;
    }
    let edge;
    if (isEdge(edgeParams)) {
      edge = edgeParams;
    } else {
      edge = {
        ...edgeParams,
        id: getEdgeId(edgeParams)
      };
    }
    edge = parseEdge(edge, void 0, defaultEdgeOptions);
    if (connectionExists(edge, edges)) {
      return false;
    }
    return edge;
  }
  function updateEdgeAction(edge, newConnection, edges, findEdge, shouldReplaceId, triggerError) {
    if (!newConnection.source || !newConnection.target) {
      triggerError(new VueFlowError(ErrorCode.EDGE_INVALID, edge.id));
      return false;
    }
    const foundEdge = findEdge(edge.id);
    if (!foundEdge) {
      triggerError(new VueFlowError(ErrorCode.EDGE_NOT_FOUND, edge.id));
      return false;
    }
    const { id: id2, ...rest } = edge;
    const newEdge = {
      ...rest,
      id: shouldReplaceId ? getEdgeId(newConnection) : id2,
      source: newConnection.source,
      target: newConnection.target,
      sourceHandle: newConnection.sourceHandle,
      targetHandle: newConnection.targetHandle
    };
    edges.splice(edges.indexOf(foundEdge), 1, newEdge);
    return newEdge;
  }
  function createGraphNodes(nodes, currGraphNodes, findNode, triggerError) {
    const parentNodes = {};
    const nextNodes = nodes.reduce((nextNodes2, node, currentIndex) => {
      if (!isNode(node)) {
        triggerError(
          new VueFlowError(ErrorCode.NODE_INVALID, node == null ? void 0 : node.id) || `[ID UNKNOWN|INDEX ${currentIndex}]`
        );
        return nextNodes2;
      }
      const parsed = parseNode(node, findNode(node.id), node.parentNode);
      if (node.parentNode) {
        parentNodes[node.parentNode] = true;
      }
      return nextNodes2.concat(parsed);
    }, []);
    const allNodes = [...nextNodes, ...currGraphNodes];
    for (const node of nextNodes) {
      const parentNode = allNodes.find((n) => n.id === node.parentNode);
      if (node.parentNode && !parentNode) {
        triggerError(new VueFlowError(ErrorCode.NODE_MISSING_PARENT, node.id, node.parentNode));
      }
      if (node.parentNode || parentNodes[node.id]) {
        if (parentNodes[node.id]) {
          node.isParent = true;
        }
        if (parentNode) {
          parentNode.isParent = true;
        }
      }
    }
    return nextNodes;
  }
  function updateConnectionLookup(connectionLookup, edges) {
    connectionLookup.clear();
    for (const edge of edges) {
      const { id: edgeId, source, target, sourceHandle = null, targetHandle = null } = edge;
      const sourceKey = `${source}-source-${sourceHandle}`;
      const targetKey = `${target}-target-${targetHandle}`;
      const prevSource = connectionLookup.get(sourceKey) || /* @__PURE__ */ new Map();
      const prevTarget = connectionLookup.get(targetKey) || /* @__PURE__ */ new Map();
      const connection = vue.markRaw({ edgeId, source, target, sourceHandle, targetHandle });
      connectionLookup.set(sourceKey, prevSource.set(`${target}-${targetHandle}`, connection));
      connectionLookup.set(targetKey, prevTarget.set(`${source}-${sourceHandle}`, connection));
    }
  }
  function handleConnectionChange(a, b, cb) {
    if (!cb) {
      return;
    }
    const diff = [];
    for (const key of a.keys()) {
      if (!b.has(key)) {
        diff.push(a.get(key));
      }
    }
    if (diff.length) {
      cb(diff);
    }
  }
  function areConnectionMapsEqual(a, b) {
    if (!a && !b) {
      return true;
    }
    if (!a || !b || a.size !== b.size) {
      return false;
    }
    if (!a.size && !b.size) {
      return true;
    }
    for (const key of a.keys()) {
      if (!b.has(key)) {
        return false;
      }
    }
    return true;
  }
  function createHooks() {
    return {
      edgesChange: createExtendedEventHook(),
      nodesChange: createExtendedEventHook(),
      nodeDoubleClick: createExtendedEventHook(),
      nodeClick: createExtendedEventHook(),
      nodeMouseEnter: createExtendedEventHook(),
      nodeMouseMove: createExtendedEventHook(),
      nodeMouseLeave: createExtendedEventHook(),
      nodeContextMenu: createExtendedEventHook(),
      nodeDragStart: createExtendedEventHook(),
      nodeDrag: createExtendedEventHook(),
      nodeDragStop: createExtendedEventHook(),
      nodesInitialized: createExtendedEventHook(),
      miniMapNodeClick: createExtendedEventHook(),
      miniMapNodeDoubleClick: createExtendedEventHook(),
      miniMapNodeMouseEnter: createExtendedEventHook(),
      miniMapNodeMouseMove: createExtendedEventHook(),
      miniMapNodeMouseLeave: createExtendedEventHook(),
      connect: createExtendedEventHook(),
      connectStart: createExtendedEventHook(),
      connectEnd: createExtendedEventHook(),
      clickConnectStart: createExtendedEventHook(),
      clickConnectEnd: createExtendedEventHook(),
      paneReady: createExtendedEventHook(),
      init: createExtendedEventHook(),
      move: createExtendedEventHook(),
      moveStart: createExtendedEventHook(),
      moveEnd: createExtendedEventHook(),
      selectionDragStart: createExtendedEventHook(),
      selectionDrag: createExtendedEventHook(),
      selectionDragStop: createExtendedEventHook(),
      selectionContextMenu: createExtendedEventHook(),
      selectionStart: createExtendedEventHook(),
      selectionEnd: createExtendedEventHook(),
      viewportChangeStart: createExtendedEventHook(),
      viewportChange: createExtendedEventHook(),
      viewportChangeEnd: createExtendedEventHook(),
      paneScroll: createExtendedEventHook(),
      paneClick: createExtendedEventHook(),
      paneContextMenu: createExtendedEventHook(),
      paneMouseEnter: createExtendedEventHook(),
      paneMouseMove: createExtendedEventHook(),
      paneMouseLeave: createExtendedEventHook(),
      edgeContextMenu: createExtendedEventHook(),
      edgeMouseEnter: createExtendedEventHook(),
      edgeMouseMove: createExtendedEventHook(),
      edgeMouseLeave: createExtendedEventHook(),
      edgeDoubleClick: createExtendedEventHook(),
      edgeClick: createExtendedEventHook(),
      edgeUpdateStart: createExtendedEventHook(),
      edgeUpdate: createExtendedEventHook(),
      edgeUpdateEnd: createExtendedEventHook(),
      updateNodeInternals: createExtendedEventHook(),
      error: createExtendedEventHook((err) => warn(err.message))
    };
  }
  function useHooks(emit, hooks) {
    vue.onBeforeMount(() => {
      for (const [key, value] of Object.entries(hooks.value)) {
        const listener = (data) => {
          emit(key, data);
        };
        value.fns.add(listener);
        tryOnScopeDispose(() => {
          value.off(listener);
        });
      }
    });
  }
  function useState() {
    return {
      vueFlowRef: null,
      viewportRef: null,
      // todo: change this to a Set
      nodes: [],
      // todo: change this to a Set
      edges: [],
      connectionLookup: /* @__PURE__ */ new Map(),
      nodeTypes: {},
      edgeTypes: {},
      initialized: false,
      dimensions: {
        width: 0,
        height: 0
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      d3Zoom: null,
      d3Selection: null,
      d3ZoomHandler: null,
      minZoom: 0.5,
      maxZoom: 2,
      translateExtent: [
        [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
        [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
      ],
      nodeExtent: [
        [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
        [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
      ],
      selectionMode: SelectionMode.Full,
      paneDragging: false,
      preventScrolling: true,
      zoomOnScroll: true,
      zoomOnPinch: true,
      zoomOnDoubleClick: true,
      panOnScroll: false,
      panOnScrollSpeed: 0.5,
      panOnScrollMode: PanOnScrollMode.Free,
      panOnDrag: true,
      edgeUpdaterRadius: 10,
      onlyRenderVisibleElements: false,
      defaultViewport: { x: 0, y: 0, zoom: 1 },
      nodesSelectionActive: false,
      userSelectionActive: false,
      userSelectionRect: null,
      defaultMarkerColor: "#b1b1b7",
      connectionLineStyle: {},
      connectionLineType: null,
      connectionLineOptions: {
        type: ConnectionLineType.Bezier,
        style: {}
      },
      connectionMode: ConnectionMode.Loose,
      connectionStartHandle: null,
      connectionEndHandle: null,
      connectionClickStartHandle: null,
      connectionPosition: { x: Number.NaN, y: Number.NaN },
      connectionRadius: 20,
      connectOnClick: true,
      connectionStatus: null,
      isValidConnection: null,
      snapGrid: [15, 15],
      snapToGrid: false,
      edgesUpdatable: false,
      edgesFocusable: true,
      nodesFocusable: true,
      nodesConnectable: true,
      nodesDraggable: true,
      nodeDragThreshold: 1,
      elementsSelectable: true,
      selectNodesOnDrag: true,
      multiSelectionActive: false,
      selectionKeyCode: "Shift",
      multiSelectionKeyCode: isMacOs() ? "Meta" : "Control",
      zoomActivationKeyCode: isMacOs() ? "Meta" : "Control",
      deleteKeyCode: "Backspace",
      panActivationKeyCode: "Space",
      hooks: createHooks(),
      applyDefault: true,
      autoConnect: false,
      fitViewOnInit: false,
      fitViewOnInitDone: false,
      noDragClassName: "nodrag",
      noWheelClassName: "nowheel",
      noPanClassName: "nopan",
      defaultEdgeOptions: void 0,
      elevateEdgesOnSelect: false,
      elevateNodesOnSelect: true,
      autoPanOnNodeDrag: true,
      autoPanOnConnect: true,
      disableKeyboardA11y: false,
      ariaLiveMessage: ""
    };
  }
  const storeOptionsToSkip = [
    "id",
    "vueFlowRef",
    "viewportRef",
    "initialized",
    "modelValue",
    "nodes",
    "edges",
    "maxZoom",
    "minZoom",
    "translateExtent",
    "hooks",
    "defaultEdgeOptions"
  ];
  function useActions(id2, state, nodeIds, edgeIds) {
    const viewportHelper = useViewportHelper(state);
    const updateNodeInternals = (ids) => {
      const updateIds = ids ?? nodeIds.value ?? [];
      state.hooks.updateNodeInternals.trigger(updateIds);
    };
    const getIncomers$1 = (nodeOrId) => {
      return getIncomers(nodeOrId, state.nodes, state.edges);
    };
    const getOutgoers$1 = (nodeOrId) => {
      return getOutgoers(nodeOrId, state.nodes, state.edges);
    };
    const getConnectedEdges$1 = (nodesOrId) => {
      return getConnectedEdges(nodesOrId, state.edges);
    };
    const findNode = (id22) => {
      if (!id22) {
        return;
      }
      if (state.nodes && !nodeIds.value.length) {
        return state.nodes.find((node) => node.id === id22);
      }
      return state.nodes[nodeIds.value.indexOf(id22)];
    };
    const findEdge = (id22) => {
      if (!id22) {
        return;
      }
      if (state.edges && !edgeIds.value.length) {
        return state.edges.find((edge) => edge.id === id22);
      }
      return state.edges[edgeIds.value.indexOf(id22)];
    };
    const updateNodePositions = (dragItems, changed, dragging) => {
      var _a, _b;
      const changes = [];
      for (const node of dragItems) {
        const change = {
          id: node.id,
          type: "position",
          dragging,
          from: node.from
        };
        if (changed) {
          change.position = node.position;
          if (node.parentNode) {
            const parentNode = findNode(node.parentNode);
            change.position = {
              x: change.position.x - (((_a = parentNode == null ? void 0 : parentNode.computedPosition) == null ? void 0 : _a.x) ?? 0),
              y: change.position.y - (((_b = parentNode == null ? void 0 : parentNode.computedPosition) == null ? void 0 : _b.y) ?? 0)
            };
          }
        }
        changes.push(change);
      }
      if (changes == null ? void 0 : changes.length) {
        state.hooks.nodesChange.trigger(changes);
      }
    };
    const updateNodeDimensions = (updates) => {
      if (!state.vueFlowRef) {
        return;
      }
      const viewportNode = state.vueFlowRef.querySelector(".vue-flow__transformationpane");
      if (!viewportNode) {
        return;
      }
      const style = window.getComputedStyle(viewportNode);
      const { m22: zoom2 } = new window.DOMMatrixReadOnly(style.transform);
      const changes = updates.reduce((res, update) => {
        const node = findNode(update.id);
        if (node) {
          const dimensions = getDimensions(update.nodeElement);
          const doUpdate = !!(dimensions.width && dimensions.height && (node.dimensions.width !== dimensions.width || node.dimensions.height !== dimensions.height || update.forceUpdate));
          if (doUpdate) {
            node.handleBounds.source = getHandleBounds(".source", update.nodeElement, zoom2);
            node.handleBounds.target = getHandleBounds(".target", update.nodeElement, zoom2);
            node.dimensions = dimensions;
            node.initialized = true;
            res.push({
              id: node.id,
              type: "dimensions",
              dimensions
            });
          }
        }
        return res;
      }, []);
      if (!state.fitViewOnInitDone && state.fitViewOnInit) {
        vue.nextTick(() => {
          viewportHelper.value.fitView();
          state.fitViewOnInitDone = true;
        });
      }
      if (changes.length) {
        state.hooks.nodesChange.trigger(changes);
      }
    };
    const nodeSelectionHandler = (nodes, selected) => {
      const nodeIds2 = nodes.map((n) => n.id);
      let changedNodes;
      let changedEdges = [];
      if (state.multiSelectionActive) {
        changedNodes = nodeIds2.map((nodeId) => createSelectionChange(nodeId, selected));
      } else {
        const selectionChanges = getSelectionChanges([...state.nodes, ...state.edges], nodeIds2);
        changedNodes = selectionChanges.changedNodes;
        changedEdges = selectionChanges.changedEdges;
      }
      if (changedNodes.length) {
        state.hooks.nodesChange.trigger(changedNodes);
      }
      if (changedEdges.length) {
        state.hooks.edgesChange.trigger(changedEdges);
      }
    };
    const edgeSelectionHandler = (edges, selected) => {
      const edgeIds2 = edges.map((e) => e.id);
      let changedNodes = [];
      let changedEdges;
      if (state.multiSelectionActive) {
        changedEdges = edgeIds2.map((edgeId) => createSelectionChange(edgeId, selected));
      } else {
        const selectionChanges = getSelectionChanges([...state.nodes, ...state.edges], edgeIds2);
        changedNodes = selectionChanges.changedNodes;
        changedEdges = selectionChanges.changedEdges;
      }
      if (changedNodes.length) {
        state.hooks.nodesChange.trigger(changedNodes);
      }
      if (changedEdges.length) {
        state.hooks.edgesChange.trigger(changedEdges);
      }
    };
    const elementSelectionHandler = (elements, selected) => {
      const nodeIds2 = elements.filter(isNode).map((n) => n.id);
      const edgeIds2 = elements.filter(isEdge).map((e) => e.id);
      let { changedNodes, changedEdges } = getSelectionChanges([...state.nodes, ...state.edges], [...nodeIds2, ...edgeIds2]);
      if (state.multiSelectionActive) {
        changedNodes = nodeIds2.map((nodeId) => createSelectionChange(nodeId, selected));
        changedEdges = edgeIds2.map((edgeId) => createSelectionChange(edgeId, selected));
      }
      if (changedNodes.length) {
        state.hooks.nodesChange.trigger(changedNodes);
      }
      if (changedEdges.length) {
        state.hooks.edgesChange.trigger(changedEdges);
      }
    };
    const addSelectedNodes = (nodes) => {
      nodeSelectionHandler(nodes, true);
    };
    const addSelectedEdges = (edges) => {
      edgeSelectionHandler(edges, true);
    };
    const addSelectedElements = (elements) => {
      elementSelectionHandler(elements, true);
    };
    const removeSelectedNodes = (nodes) => {
      if (!nodes.length) {
        return nodeSelectionHandler(nodes, false);
      }
      const nodeIds2 = nodes.map((n) => n.id);
      const changedNodes = nodeIds2.map((nodeId) => createSelectionChange(nodeId, false));
      if (changedNodes.length) {
        state.hooks.nodesChange.trigger(changedNodes);
      }
    };
    const removeSelectedEdges = (edges) => {
      if (!edges.length) {
        return edgeSelectionHandler(edges, false);
      }
      const edgeIds2 = edges.map((e) => e.id);
      const changedEdges = edgeIds2.map((edgeId) => createSelectionChange(edgeId, false));
      if (changedEdges.length) {
        state.hooks.edgesChange.trigger(changedEdges);
      }
    };
    const removeSelectedElements = (elements) => {
      if (!elements || !elements.length) {
        return elementSelectionHandler([], false);
      }
      const changes = elements.reduce(
        (changes2, curr) => {
          const selectionChange = createSelectionChange(curr.id, false);
          if (isNode(curr)) {
            changes2.nodes.push(selectionChange);
          } else {
            changes2.edges.push(selectionChange);
          }
          return changes2;
        },
        { nodes: [], edges: [] }
      );
      if (changes.nodes.length) {
        state.hooks.nodesChange.trigger(changes.nodes);
      }
      if (changes.edges.length) {
        state.hooks.edgesChange.trigger(changes.edges);
      }
    };
    const setMinZoom = (minZoom) => {
      var _a;
      (_a = state.d3Zoom) == null ? void 0 : _a.scaleExtent([minZoom, state.maxZoom]);
      state.minZoom = minZoom;
    };
    const setMaxZoom = (maxZoom) => {
      var _a;
      (_a = state.d3Zoom) == null ? void 0 : _a.scaleExtent([state.minZoom, maxZoom]);
      state.maxZoom = maxZoom;
    };
    const setTranslateExtent = (translateExtent) => {
      var _a;
      (_a = state.d3Zoom) == null ? void 0 : _a.translateExtent(translateExtent);
      state.translateExtent = translateExtent;
    };
    const setNodeExtent = (nodeExtent) => {
      state.nodeExtent = nodeExtent;
      updateNodeInternals(nodeIds.value);
    };
    const setInteractive = (isInteractive) => {
      state.nodesDraggable = isInteractive;
      state.nodesConnectable = isInteractive;
      state.elementsSelectable = isInteractive;
    };
    const setNodes = (nodes) => {
      const nextNodes = nodes instanceof Function ? nodes(state.nodes) : nodes;
      if (!state.initialized && !nextNodes.length) {
        return;
      }
      state.nodes = createGraphNodes(nextNodes, state.nodes, findNode, state.hooks.error.trigger);
    };
    const setEdges = (edges) => {
      const nextEdges = edges instanceof Function ? edges(state.edges) : edges;
      if (!state.initialized && !nextEdges.length) {
        return;
      }
      const validEdges = state.isValidConnection ? nextEdges.filter(
        (edge) => state.isValidConnection(edge, {
          edges: state.edges,
          nodes: state.nodes,
          sourceNode: findNode(edge.source),
          targetNode: findNode(edge.target)
        })
      ) : nextEdges;
      updateConnectionLookup(state.connectionLookup, validEdges);
      state.edges = validEdges.reduce((res, edge) => {
        const sourceNode = findNode(edge.source);
        const targetNode = findNode(edge.target);
        const missingSource = !sourceNode || typeof sourceNode === "undefined";
        const missingTarget = !targetNode || typeof targetNode === "undefined";
        if (missingSource && missingTarget) {
          state.hooks.error.trigger(new VueFlowError(ErrorCode.EDGE_SOURCE_TARGET_MISSING, edge.id, edge.source, edge.target));
        } else {
          if (missingSource) {
            state.hooks.error.trigger(new VueFlowError(ErrorCode.EDGE_SOURCE_MISSING, edge.id, edge.source));
          }
          if (missingTarget) {
            state.hooks.error.trigger(new VueFlowError(ErrorCode.EDGE_TARGET_MISSING, edge.id, edge.target));
          }
        }
        if (missingSource || missingTarget) {
          return res;
        }
        const existingEdge = findEdge(edge.id);
        res.push({
          ...parseEdge(edge, existingEdge, state.defaultEdgeOptions),
          sourceNode,
          targetNode
        });
        return res;
      }, []);
    };
    const setElements = (elements) => {
      const nextElements = elements instanceof Function ? elements([...state.nodes, ...state.edges]) : elements;
      if (!state.initialized && !nextElements.length) {
        return;
      }
      setNodes(nextElements.filter(isNode));
      setEdges(nextElements.filter(isEdge));
    };
    const addNodes = (nodes) => {
      let nextNodes = nodes instanceof Function ? nodes(state.nodes) : nodes;
      nextNodes = Array.isArray(nextNodes) ? nextNodes : [nextNodes];
      const graphNodes = createGraphNodes(nextNodes, state.nodes, findNode, state.hooks.error.trigger);
      const changes = graphNodes.map(createAdditionChange);
      if (changes.length) {
        state.hooks.nodesChange.trigger(changes);
      }
    };
    const addEdges = (params) => {
      let nextEdges = params instanceof Function ? params(state.edges) : params;
      nextEdges = Array.isArray(nextEdges) ? nextEdges : [nextEdges];
      const validEdges = state.isValidConnection ? nextEdges.filter((edge) => {
        var _a;
        return (_a = state.isValidConnection) == null ? void 0 : _a.call(state, edge, {
          edges: state.edges,
          nodes: state.nodes,
          sourceNode: findNode(edge.source),
          targetNode: findNode(edge.target)
        });
      }) : nextEdges;
      const changes = validEdges.reduce((edgeChanges, connection) => {
        const edge = addEdgeToStore(connection, state.edges, state.hooks.error.trigger, state.defaultEdgeOptions);
        if (edge) {
          const sourceNode = findNode(edge.source);
          const targetNode = findNode(edge.target);
          edgeChanges.push(
            createAdditionChange({
              ...edge,
              sourceNode,
              targetNode
            })
          );
        }
        return edgeChanges;
      }, []);
      if (changes.length) {
        state.hooks.edgesChange.trigger(changes);
      }
    };
    const removeNodes = (nodes, removeConnectedEdges = true, removeChildren = false) => {
      const nextNodes = nodes instanceof Function ? nodes(state.nodes) : nodes;
      const nodesToRemove = Array.isArray(nextNodes) ? nextNodes : [nextNodes];
      const nodeChanges = [];
      const edgeChanges = [];
      function createEdgeRemovalChanges(nodes2) {
        const connections = getConnectedEdges$1(nodes2).filter((edge) => isDef(edge.deletable) ? edge.deletable : true);
        edgeChanges.push(
          ...connections.map(
            (connection) => createEdgeRemoveChange(
              connection.id,
              connection.source,
              connection.target,
              connection.sourceHandle,
              connection.targetHandle
            )
          )
        );
      }
      function createChildrenRemovalChanges(id22) {
        const children2 = state.nodes.filter((n) => n.parentNode === id22);
        if (children2.length) {
          const childIds = children2.map((n) => n.id);
          nodeChanges.push(...childIds.map((id3) => createNodeRemoveChange(id3)));
          if (removeConnectedEdges) {
            createEdgeRemovalChanges(children2);
          }
          for (const child of children2) {
            createChildrenRemovalChanges(child.id);
          }
        }
      }
      for (const item of nodesToRemove) {
        const currNode = typeof item === "string" ? findNode(item) : item;
        if (!currNode) {
          continue;
        }
        if (isDef(currNode.deletable) && !currNode.deletable) {
          continue;
        }
        nodeChanges.push(createNodeRemoveChange(currNode.id));
        if (removeConnectedEdges) {
          createEdgeRemovalChanges([currNode]);
        }
        if (removeChildren) {
          createChildrenRemovalChanges(currNode.id);
        }
      }
      if (edgeChanges.length) {
        state.hooks.edgesChange.trigger(edgeChanges);
      }
      if (nodeChanges.length) {
        state.hooks.nodesChange.trigger(nodeChanges);
      }
    };
    const removeEdges = (edges) => {
      const nextEdges = edges instanceof Function ? edges(state.edges) : edges;
      const edgesToRemove = Array.isArray(nextEdges) ? nextEdges : [nextEdges];
      const changes = [];
      for (const item of edgesToRemove) {
        const currEdge = typeof item === "string" ? findEdge(item) : item;
        if (!currEdge) {
          continue;
        }
        if (isDef(currEdge.deletable) && !currEdge.deletable) {
          continue;
        }
        changes.push(
          createEdgeRemoveChange(
            typeof item === "string" ? item : item.id,
            currEdge.source,
            currEdge.target,
            currEdge.sourceHandle,
            currEdge.targetHandle
          )
        );
      }
      state.hooks.edgesChange.trigger(changes);
    };
    const updateEdge2 = (oldEdge, newConnection, shouldReplaceId = true) => updateEdgeAction(oldEdge, newConnection, state.edges, findEdge, shouldReplaceId, state.hooks.error.trigger);
    const applyNodeChanges2 = (changes) => {
      return applyChanges(changes, state.nodes);
    };
    const applyEdgeChanges2 = (changes) => {
      const changedEdges = applyChanges(changes, state.edges);
      updateConnectionLookup(state.connectionLookup, changedEdges);
      return changedEdges;
    };
    const updateNode = (id22, nodeUpdate, options = { replace: false }) => {
      const node = findNode(id22);
      if (!node) {
        return;
      }
      const nextNode = typeof nodeUpdate === "function" ? nodeUpdate(node) : nodeUpdate;
      if (options.replace) {
        state.nodes.splice(state.nodes.indexOf(node), 1, nextNode);
      } else {
        Object.assign(node, nextNode);
      }
    };
    const updateNodeData = (id22, dataUpdate, options = { replace: false }) => {
      updateNode(
        id22,
        (node) => {
          const nextData = typeof dataUpdate === "function" ? dataUpdate(node) : dataUpdate;
          return options.replace ? { ...node, data: nextData } : { ...node, data: { ...node.data, ...nextData } };
        },
        options
      );
    };
    const startConnection = (startHandle, position, event, isClick = false) => {
      if (isClick) {
        state.connectionClickStartHandle = startHandle;
      } else {
        state.connectionStartHandle = startHandle;
      }
      state.connectionEndHandle = null;
      state.connectionStatus = null;
      if (position) {
        state.connectionPosition = position;
      }
    };
    const updateConnection = (position, result = null, status = null) => {
      if (state.connectionStartHandle) {
        state.connectionPosition = position;
        state.connectionEndHandle = result;
        state.connectionStatus = status;
      }
    };
    const endConnection = (event, isClick) => {
      state.connectionPosition = { x: Number.NaN, y: Number.NaN };
      state.connectionEndHandle = null;
      state.connectionStatus = null;
      if (isClick) {
        state.connectionClickStartHandle = null;
      } else {
        state.connectionStartHandle = null;
      }
    };
    const getNodeRect = (nodeOrRect) => {
      const isRectObj = isRect(nodeOrRect);
      const node = isRectObj ? null : isGraphNode(nodeOrRect) ? nodeOrRect : findNode(nodeOrRect.id);
      if (!isRectObj && !node) {
        return [null, null, isRectObj];
      }
      const nodeRect = isRectObj ? nodeOrRect : nodeToRect(node);
      return [nodeRect, node, isRectObj];
    };
    const getIntersectingNodes = (nodeOrRect, partially = true, nodes = state.nodes) => {
      const [nodeRect, node, isRect2] = getNodeRect(nodeOrRect);
      if (!nodeRect) {
        return [];
      }
      return (nodes || state.nodes).filter((n) => {
        if (!isRect2 && (n.id === node.id || !n.computedPosition)) {
          return false;
        }
        const currNodeRect = nodeToRect(n);
        const overlappingArea = getOverlappingArea(currNodeRect, nodeRect);
        const partiallyVisible = partially && overlappingArea > 0;
        return partiallyVisible || overlappingArea >= Number(nodeRect.width) * Number(nodeRect.height);
      });
    };
    const isNodeIntersecting = (nodeOrRect, area, partially = true) => {
      const [nodeRect] = getNodeRect(nodeOrRect);
      if (!nodeRect) {
        return false;
      }
      const overlappingArea = getOverlappingArea(nodeRect, area);
      const partiallyVisible = partially && overlappingArea > 0;
      return partiallyVisible || overlappingArea >= Number(nodeRect.width) * Number(nodeRect.height);
    };
    const panBy = (delta) => {
      const { viewport, dimensions, d3Zoom, d3Selection, translateExtent } = state;
      if (!d3Zoom || !d3Selection || !delta.x && !delta.y) {
        return false;
      }
      const nextTransform = identity.translate(viewport.x + delta.x, viewport.y + delta.y).scale(viewport.zoom);
      const extent = [
        [0, 0],
        [dimensions.width, dimensions.height]
      ];
      const constrainedTransform = d3Zoom.constrain()(nextTransform, extent, translateExtent);
      const transformChanged = state.viewport.x !== constrainedTransform.x || state.viewport.y !== constrainedTransform.y || state.viewport.zoom !== constrainedTransform.k;
      d3Zoom.transform(d3Selection, constrainedTransform);
      return transformChanged;
    };
    const setState = (options) => {
      const opts = options instanceof Function ? options(state) : options;
      const exclude = [
        "d3Zoom",
        "d3Selection",
        "d3ZoomHandler",
        "viewportRef",
        "vueFlowRef",
        "dimensions",
        "hooks"
      ];
      if (isDef(opts.defaultEdgeOptions)) {
        state.defaultEdgeOptions = opts.defaultEdgeOptions;
      }
      const elements = opts.modelValue || opts.nodes || opts.edges ? [] : void 0;
      if (elements) {
        if (opts.modelValue) {
          elements.push(...opts.modelValue);
        }
        if (opts.nodes) {
          elements.push(...opts.nodes);
        }
        if (opts.edges) {
          elements.push(...opts.edges);
        }
        setElements(elements);
      }
      const setSkippedOptions = () => {
        if (isDef(opts.maxZoom)) {
          setMaxZoom(opts.maxZoom);
        }
        if (isDef(opts.minZoom)) {
          setMinZoom(opts.minZoom);
        }
        if (isDef(opts.translateExtent)) {
          setTranslateExtent(opts.translateExtent);
        }
      };
      for (const o of Object.keys(opts)) {
        const key = o;
        const option = opts[key];
        if (![...storeOptionsToSkip, ...exclude].includes(key) && isDef(option)) {
          state[key] = option;
        }
      }
      until(() => state.d3Zoom).not.toBeNull().then(setSkippedOptions);
      if (!state.initialized) {
        state.initialized = true;
      }
    };
    const toObject = () => {
      return JSON.parse(
        JSON.stringify({
          nodes: state.nodes.map((n) => {
            const {
              computedPosition: _,
              handleBounds: __,
              selected: ___,
              dimensions: ____,
              isParent: _____,
              resizing: ______,
              dragging: _______,
              initialized: ________,
              events: _________,
              ...rest
            } = n;
            return rest;
          }),
          edges: state.edges.map((e) => {
            const { selected: _, sourceNode: __, targetNode: ___, events: ____, ...rest } = e;
            return rest;
          }),
          position: [state.viewport.x, state.viewport.y],
          zoom: state.viewport.zoom,
          viewport: state.viewport
        })
      );
    };
    const fromObject = (obj) => {
      return new Promise((resolve) => {
        const { nodes, edges, position, zoom: zoom2, viewport } = obj;
        if (nodes) {
          setNodes(nodes);
        }
        if (edges) {
          setEdges(edges);
        }
        if ((viewport == null ? void 0 : viewport.x) && (viewport == null ? void 0 : viewport.y) || position) {
          const x = (viewport == null ? void 0 : viewport.x) || position[0];
          const y = (viewport == null ? void 0 : viewport.y) || position[1];
          const nextZoom = (viewport == null ? void 0 : viewport.zoom) || zoom2 || state.viewport.zoom;
          return until(() => viewportHelper.value.viewportInitialized).toBe(true).then(() => {
            viewportHelper.value.setViewport({
              x,
              y,
              zoom: nextZoom
            }).then(() => {
              resolve(true);
            });
          });
        } else {
          resolve(true);
        }
      });
    };
    const $reset = () => {
      const resetState = useState();
      state.edges = [];
      state.nodes = [];
      if (state.d3Zoom && state.d3Selection) {
        const updatedTransform = identity.translate(resetState.defaultViewport.x ?? 0, resetState.defaultViewport.y ?? 0).scale(clamp(resetState.defaultViewport.zoom ?? 1, resetState.minZoom, resetState.maxZoom));
        const bbox = state.viewportRef.getBoundingClientRect();
        const extent = [
          [0, 0],
          [bbox.width, bbox.height]
        ];
        const constrainedTransform = state.d3Zoom.constrain()(updatedTransform, extent, resetState.translateExtent);
        state.d3Zoom.transform(state.d3Selection, constrainedTransform);
      }
      setState(resetState);
    };
    return {
      updateNodePositions,
      updateNodeDimensions,
      setElements,
      setNodes,
      setEdges,
      addNodes,
      addEdges,
      removeNodes,
      removeEdges,
      findNode,
      findEdge,
      updateEdge: updateEdge2,
      updateNode,
      updateNodeData,
      applyEdgeChanges: applyEdgeChanges2,
      applyNodeChanges: applyNodeChanges2,
      addSelectedElements,
      addSelectedNodes,
      addSelectedEdges,
      setMinZoom,
      setMaxZoom,
      setTranslateExtent,
      setNodeExtent,
      removeSelectedElements,
      removeSelectedNodes,
      removeSelectedEdges,
      startConnection,
      updateConnection,
      endConnection,
      setInteractive,
      setState,
      getIntersectingNodes,
      getIncomers: getIncomers$1,
      getOutgoers: getOutgoers$1,
      getConnectedEdges: getConnectedEdges$1,
      isNodeIntersecting,
      panBy,
      fitView: (params) => viewportHelper.value.fitView(params),
      zoomIn: (transitionOpts) => viewportHelper.value.zoomIn(transitionOpts),
      zoomOut: (transitionOpts) => viewportHelper.value.zoomOut(transitionOpts),
      zoomTo: (zoomLevel, transitionOpts) => viewportHelper.value.zoomTo(zoomLevel, transitionOpts),
      setViewport: (params, transitionOpts) => viewportHelper.value.setViewport(params, transitionOpts),
      setTransform: (params, transitionOpts) => viewportHelper.value.setTransform(params, transitionOpts),
      getViewport: () => viewportHelper.value.getViewport(),
      getTransform: () => viewportHelper.value.getTransform(),
      setCenter: (x, y, opts) => viewportHelper.value.setCenter(x, y, opts),
      fitBounds: (params, opts) => viewportHelper.value.fitBounds(params, opts),
      project: (params) => viewportHelper.value.project(params),
      screenToFlowCoordinate: (params) => viewportHelper.value.screenToFlowCoordinate(params),
      flowToScreenCoordinate: (params) => viewportHelper.value.flowToScreenCoordinate(params),
      toObject,
      fromObject,
      updateNodeInternals,
      viewportHelper,
      $reset,
      $destroy: () => {
      }
    };
  }
  const _hoisted_1$9 = ["data-id", "data-handleid", "data-nodeid", "data-handlepos"];
  const __default__$f = {
    name: "Handle",
    compatConfig: { MODE: 3 }
  };
  const _sfc_main$f = /* @__PURE__ */ vue.defineComponent({
    ...__default__$f,
    props: {
      id: {},
      type: {},
      position: { default: () => Position.Top },
      isValidConnection: { type: Function },
      connectable: { type: [Boolean, Number, String, Function], default: void 0 },
      connectableStart: { type: Boolean, default: true },
      connectableEnd: { type: Boolean, default: true }
    },
    setup(__props, { expose: __expose }) {
      const props = vue.createPropsRestProxy(__props, ["position", "connectable", "connectableStart", "connectableEnd", "id"]);
      const type = vue.toRef(() => props.type ?? "source");
      const isValidConnection = vue.toRef(() => props.isValidConnection ?? null);
      const {
        connectionStartHandle,
        connectionClickStartHandle,
        connectionEndHandle,
        vueFlowRef,
        nodesConnectable,
        noDragClassName,
        noPanClassName
      } = useVueFlow();
      const { id: nodeId, node, nodeEl, connectedEdges } = useNode();
      const handle = vue.ref();
      const handleId = vue.toRef(() => __props.id ?? `${nodeId}__handle-${__props.position}`);
      const isConnectableStart = vue.toRef(() => typeof __props.connectableStart !== "undefined" ? __props.connectableStart : true);
      const isConnectableEnd = vue.toRef(() => typeof __props.connectableEnd !== "undefined" ? __props.connectableEnd : true);
      const isConnecting = vue.toRef(
        () => {
          var _a, _b, _c, _d, _e, _f;
          return ((_a = connectionStartHandle.value) == null ? void 0 : _a.nodeId) === nodeId && ((_b = connectionStartHandle.value) == null ? void 0 : _b.handleId) === handleId.value && ((_c = connectionStartHandle.value) == null ? void 0 : _c.type) === type.value || ((_d = connectionEndHandle.value) == null ? void 0 : _d.nodeId) === nodeId && ((_e = connectionEndHandle.value) == null ? void 0 : _e.handleId) === handleId.value && ((_f = connectionEndHandle.value) == null ? void 0 : _f.type) === type.value;
        }
      );
      const isClickConnecting = vue.toRef(
        () => {
          var _a, _b, _c;
          return ((_a = connectionClickStartHandle.value) == null ? void 0 : _a.nodeId) === nodeId && ((_b = connectionClickStartHandle.value) == null ? void 0 : _b.handleId) === handleId.value && ((_c = connectionClickStartHandle.value) == null ? void 0 : _c.type) === type.value;
        }
      );
      const { handlePointerDown, handleClick } = useHandle({
        nodeId,
        handleId,
        isValidConnection,
        type
      });
      const isConnectable = vue.computed(() => {
        if (typeof __props.connectable === "string" && __props.connectable === "single") {
          return !connectedEdges.value.some((edge) => {
            const id2 = edge[`${type.value}Handle`];
            if (edge[type.value] !== nodeId) {
              return false;
            }
            return id2 ? id2 === handleId.value : true;
          });
        }
        if (typeof __props.connectable === "number") {
          return connectedEdges.value.filter((edge) => {
            const id2 = edge[`${type.value}Handle`];
            if (edge[type.value] !== nodeId) {
              return false;
            }
            return id2 ? id2 === handleId.value : true;
          }).length < __props.connectable;
        }
        if (typeof __props.connectable === "function") {
          return __props.connectable(node, connectedEdges.value);
        }
        return isDef(__props.connectable) ? __props.connectable : nodesConnectable.value;
      });
      until(() => node.initialized).toBe(true, { flush: "post" }).then(() => {
        var _a;
        const existingBounds = (_a = node.handleBounds[type.value]) == null ? void 0 : _a.find((b) => b.id === handleId.value);
        if (!vueFlowRef.value || existingBounds) {
          return;
        }
        const viewportNode = vueFlowRef.value.querySelector(".vue-flow__transformationpane");
        if (!nodeEl.value || !handle.value || !viewportNode || !handleId.value) {
          return;
        }
        const nodeBounds = nodeEl.value.getBoundingClientRect();
        const handleBounds = handle.value.getBoundingClientRect();
        const style = window.getComputedStyle(viewportNode);
        const { m22: zoom2 } = new window.DOMMatrixReadOnly(style.transform);
        const nextBounds = {
          id: handleId.value,
          position: __props.position,
          x: (handleBounds.left - nodeBounds.left) / zoom2,
          y: (handleBounds.top - nodeBounds.top) / zoom2,
          ...getDimensions(handle.value)
        };
        node.handleBounds[type.value] = [...node.handleBounds[type.value] ?? [], nextBounds];
      });
      vue.onUnmounted(() => {
        const handleBounds = node.handleBounds[type.value];
        if (handleBounds) {
          node.handleBounds[type.value] = handleBounds.filter((b) => b.id !== handleId.value);
        }
      });
      function onPointerDown(event) {
        const isMouseTriggered = isMouseEvent(event);
        if (isConnectable.value && isConnectableStart.value && (isMouseTriggered && event.button === 0 || !isMouseTriggered)) {
          handlePointerDown(event);
        }
      }
      function onClick(event) {
        if (!nodeId || !connectionClickStartHandle.value && !isConnectableStart.value) {
          return;
        }
        if (isConnectable.value) {
          handleClick(event);
        }
      }
      __expose({
        handleClick,
        handlePointerDown,
        onClick,
        onPointerDown
      });
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", {
          ref_key: "handle",
          ref: handle,
          "data-id": `${vue.unref(nodeId)}-${handleId.value}-${type.value}`,
          "data-handleid": handleId.value,
          "data-nodeid": vue.unref(nodeId),
          "data-handlepos": _ctx.position,
          class: vue.normalizeClass(["vue-flow__handle", [
            `vue-flow__handle-${_ctx.position}`,
            `vue-flow__handle-${handleId.value}`,
            vue.unref(noDragClassName),
            vue.unref(noPanClassName),
            type.value,
            {
              connectable: isConnectable.value,
              connecting: isClickConnecting.value,
              connectablestart: isConnectableStart.value,
              connectableend: isConnectableEnd.value,
              connectionindicator: isConnectable.value && (isConnectableStart.value && !isConnecting.value || isConnectableEnd.value && isConnecting.value)
            }
          ]]),
          onMousedown: onPointerDown,
          onTouchstartPassive: onPointerDown,
          onClick
        }, [
          vue.renderSlot(_ctx.$slots, "default", { id: _ctx.id })
        ], 42, _hoisted_1$9);
      };
    }
  });
  const DefaultNode = function({
    sourcePosition = Position.Bottom,
    targetPosition = Position.Top,
    label: _label,
    connectable = true,
    isValidTargetPos,
    isValidSourcePos,
    data
  }) {
    const label = data.label || _label;
    return [
      vue.h(_sfc_main$f, { type: "target", position: targetPosition, connectable, isValidConnection: isValidTargetPos }),
      typeof label !== "string" && label ? vue.h(label) : vue.h("div", { innerHTML: label }),
      vue.h(_sfc_main$f, { type: "source", position: sourcePosition, connectable, isValidConnection: isValidSourcePos })
    ];
  };
  DefaultNode.props = ["sourcePosition", "targetPosition", "label", "isValidTargetPos", "isValidSourcePos", "connectable", "data"];
  DefaultNode.inheritAttrs = false;
  DefaultNode.compatConfig = { MODE: 3 };
  const DefaultNode$1 = DefaultNode;
  const OutputNode = function({
    targetPosition = Position.Top,
    label: _label,
    connectable = true,
    isValidTargetPos,
    data
  }) {
    const label = data.label || _label;
    return [
      vue.h(_sfc_main$f, { type: "target", position: targetPosition, connectable, isValidConnection: isValidTargetPos }),
      typeof label !== "string" && label ? vue.h(label) : vue.h("div", { innerHTML: label })
    ];
  };
  OutputNode.props = ["targetPosition", "label", "isValidTargetPos", "connectable", "data"];
  OutputNode.inheritAttrs = false;
  OutputNode.compatConfig = { MODE: 3 };
  const OutputNode$1 = OutputNode;
  const InputNode = function({
    sourcePosition = Position.Bottom,
    label: _label,
    connectable = true,
    isValidSourcePos,
    data
  }) {
    const label = data.label || _label;
    return [
      typeof label !== "string" && label ? vue.h(label) : vue.h("div", { innerHTML: label }),
      vue.h(_sfc_main$f, { type: "source", position: sourcePosition, connectable, isValidConnection: isValidSourcePos })
    ];
  };
  InputNode.props = ["sourcePosition", "label", "isValidSourcePos", "connectable", "data"];
  InputNode.inheritAttrs = false;
  InputNode.compatConfig = { MODE: 3 };
  const InputNode$1 = InputNode;
  const _hoisted_1$8 = ["transform"];
  const _hoisted_2$2 = ["width", "height", "x", "y", "rx", "ry"];
  const _hoisted_3$1 = ["y"];
  const __default__$e = {
    name: "EdgeText",
    compatConfig: { MODE: 3 }
  };
  const _sfc_main$e = /* @__PURE__ */ vue.defineComponent({
    ...__default__$e,
    props: {
      x: {},
      y: {},
      label: {},
      labelStyle: { default: () => ({}) },
      labelShowBg: { type: Boolean, default: true },
      labelBgStyle: { default: () => ({}) },
      labelBgPadding: { default: () => [2, 4] },
      labelBgBorderRadius: { default: 2 }
    },
    setup(__props) {
      const box = vue.ref({ x: 0, y: 0, width: 0, height: 0 });
      const el = vue.ref(null);
      const transform = vue.computed(() => `translate(${__props.x - box.value.width / 2} ${__props.y - box.value.height / 2})`);
      vue.onMounted(getBox);
      vue.watch([() => __props.x, () => __props.y, el, () => __props.label], getBox);
      function getBox() {
        if (!el.value) {
          return;
        }
        const nextBox = el.value.getBBox();
        if (nextBox.width !== box.value.width || nextBox.height !== box.value.height) {
          box.value = nextBox;
        }
      }
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("g", {
          transform: transform.value,
          class: "vue-flow__edge-textwrapper"
        }, [
          _ctx.labelShowBg ? (vue.openBlock(), vue.createElementBlock("rect", {
            key: 0,
            class: "vue-flow__edge-textbg",
            width: `${box.value.width + 2 * _ctx.labelBgPadding[0]}px`,
            height: `${box.value.height + 2 * _ctx.labelBgPadding[1]}px`,
            x: -_ctx.labelBgPadding[0],
            y: -_ctx.labelBgPadding[1],
            style: vue.normalizeStyle(_ctx.labelBgStyle),
            rx: _ctx.labelBgBorderRadius,
            ry: _ctx.labelBgBorderRadius
          }, null, 12, _hoisted_2$2)) : vue.createCommentVNode("", true),
          vue.createElementVNode("text", vue.mergeProps(_ctx.$attrs, {
            ref_key: "el",
            ref: el,
            class: "vue-flow__edge-text",
            y: box.value.height / 2,
            dy: "0.3em",
            style: _ctx.labelStyle
          }), [
            vue.renderSlot(_ctx.$slots, "default", {}, () => [
              typeof _ctx.label !== "string" ? (vue.openBlock(), vue.createBlock(vue.resolveDynamicComponent(_ctx.label), { key: 0 })) : (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 1 }, [
                vue.createTextVNode(vue.toDisplayString(_ctx.label), 1)
              ], 64))
            ])
          ], 16, _hoisted_3$1)
        ], 8, _hoisted_1$8);
      };
    }
  });
  const _hoisted_1$7 = ["id", "d", "marker-end", "marker-start"];
  const _hoisted_2$1 = ["d", "stroke-width"];
  const __default__$d = {
    name: "BaseEdge",
    inheritAttrs: false,
    compatConfig: { MODE: 3 }
  };
  const _sfc_main$d = /* @__PURE__ */ vue.defineComponent({
    ...__default__$d,
    props: {
      id: {},
      labelX: {},
      labelY: {},
      path: {},
      label: {},
      markerStart: {},
      markerEnd: {},
      interactionWidth: { default: 20 },
      style: {},
      ref: { type: [String, Object, Function] },
      labelStyle: {},
      labelShowBg: { type: Boolean, default: true },
      labelBgStyle: {},
      labelBgPadding: {},
      labelBgBorderRadius: {}
    },
    setup(__props, { expose: __expose }) {
      const props = vue.createPropsRestProxy(__props, ["interactionWidth", "labelShowBg"]);
      const pathEl = vue.ref(null);
      const interactionEl = vue.ref(null);
      const labelEl = vue.ref(null);
      const attrs = vue.useAttrs();
      __expose({
        pathEl,
        interactionEl,
        labelEl
      });
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock(vue.Fragment, null, [
          vue.createElementVNode("path", {
            id: _ctx.id,
            ref_key: "pathEl",
            ref: pathEl,
            d: _ctx.path,
            style: vue.normalizeStyle(props.style),
            class: vue.normalizeClass(["vue-flow__edge-path", vue.unref(attrs).class]),
            "marker-end": _ctx.markerEnd,
            "marker-start": _ctx.markerStart
          }, null, 14, _hoisted_1$7),
          _ctx.interactionWidth ? (vue.openBlock(), vue.createElementBlock("path", {
            key: 0,
            ref_key: "interactionEl",
            ref: interactionEl,
            fill: "none",
            d: _ctx.path,
            "stroke-width": _ctx.interactionWidth,
            "stroke-opacity": 0,
            class: "vue-flow__edge-interaction"
          }, null, 8, _hoisted_2$1)) : vue.createCommentVNode("", true),
          _ctx.label && _ctx.labelX && _ctx.labelY ? (vue.openBlock(), vue.createBlock(_sfc_main$e, {
            key: 1,
            ref_key: "labelEl",
            ref: labelEl,
            x: _ctx.labelX,
            y: _ctx.labelY,
            label: _ctx.label,
            "label-show-bg": _ctx.labelShowBg,
            "label-bg-style": _ctx.labelBgStyle,
            "label-bg-padding": _ctx.labelBgPadding,
            "label-bg-border-radius": _ctx.labelBgBorderRadius,
            "label-style": _ctx.labelStyle
          }, null, 8, ["x", "y", "label", "label-show-bg", "label-bg-style", "label-bg-padding", "label-bg-border-radius", "label-style"])) : vue.createCommentVNode("", true)
        ], 64);
      };
    }
  });
  function getSimpleEdgeCenter({
    sourceX,
    sourceY,
    targetX,
    targetY
  }) {
    const xOffset = Math.abs(targetX - sourceX) / 2;
    const centerX = targetX < sourceX ? targetX + xOffset : targetX - xOffset;
    const yOffset = Math.abs(targetY - sourceY) / 2;
    const centerY = targetY < sourceY ? targetY + yOffset : targetY - yOffset;
    return [centerX, centerY, xOffset, yOffset];
  }
  function getBezierEdgeCenter({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourceControlX,
    sourceControlY,
    targetControlX,
    targetControlY
  }) {
    const centerX = sourceX * 0.125 + sourceControlX * 0.375 + targetControlX * 0.375 + targetX * 0.125;
    const centerY = sourceY * 0.125 + sourceControlY * 0.375 + targetControlY * 0.375 + targetY * 0.125;
    const offsetX = Math.abs(centerX - sourceX);
    const offsetY = Math.abs(centerY - sourceY);
    return [centerX, centerY, offsetX, offsetY];
  }
  function calculateControlOffset(distance2, curvature) {
    if (distance2 >= 0) {
      return 0.5 * distance2;
    } else {
      return curvature * 25 * Math.sqrt(-distance2);
    }
  }
  function getControlWithCurvature({ pos, x1, y1, x2, y2, c }) {
    let ctX, ctY;
    switch (pos) {
      case Position.Left:
        ctX = x1 - calculateControlOffset(x1 - x2, c);
        ctY = y1;
        break;
      case Position.Right:
        ctX = x1 + calculateControlOffset(x2 - x1, c);
        ctY = y1;
        break;
      case Position.Top:
        ctX = x1;
        ctY = y1 - calculateControlOffset(y1 - y2, c);
        break;
      case Position.Bottom:
        ctX = x1;
        ctY = y1 + calculateControlOffset(y2 - y1, c);
        break;
    }
    return [ctX, ctY];
  }
  function getBezierPath({
    sourceX,
    sourceY,
    sourcePosition = Position.Bottom,
    targetX,
    targetY,
    targetPosition = Position.Top,
    curvature = 0.25
  }) {
    const [sourceControlX, sourceControlY] = getControlWithCurvature({
      pos: sourcePosition,
      x1: sourceX,
      y1: sourceY,
      x2: targetX,
      y2: targetY,
      c: curvature
    });
    const [targetControlX, targetControlY] = getControlWithCurvature({
      pos: targetPosition,
      x1: targetX,
      y1: targetY,
      x2: sourceX,
      y2: sourceY,
      c: curvature
    });
    const [labelX, labelY, offsetX, offsetY] = getBezierEdgeCenter({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourceControlX,
      sourceControlY,
      targetControlX,
      targetControlY
    });
    return [
      `M${sourceX},${sourceY} C${sourceControlX},${sourceControlY} ${targetControlX},${targetControlY} ${targetX},${targetY}`,
      labelX,
      labelY,
      offsetX,
      offsetY
    ];
  }
  function getControl({ pos, x1, y1, x2, y2 }) {
    let ctX, ctY;
    switch (pos) {
      case Position.Left:
      case Position.Right:
        ctX = 0.5 * (x1 + x2);
        ctY = y1;
        break;
      case Position.Top:
      case Position.Bottom:
        ctX = x1;
        ctY = 0.5 * (y1 + y2);
        break;
    }
    return [ctX, ctY];
  }
  function getSimpleBezierPath({
    sourceX,
    sourceY,
    sourcePosition = Position.Bottom,
    targetX,
    targetY,
    targetPosition = Position.Top
  }) {
    const [sourceControlX, sourceControlY] = getControl({
      pos: sourcePosition,
      x1: sourceX,
      y1: sourceY,
      x2: targetX,
      y2: targetY
    });
    const [targetControlX, targetControlY] = getControl({
      pos: targetPosition,
      x1: targetX,
      y1: targetY,
      x2: sourceX,
      y2: sourceY
    });
    const [centerX, centerY, offsetX, offsetY] = getBezierEdgeCenter({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourceControlX,
      sourceControlY,
      targetControlX,
      targetControlY
    });
    return [
      `M${sourceX},${sourceY} C${sourceControlX},${sourceControlY} ${targetControlX},${targetControlY} ${targetX},${targetY}`,
      centerX,
      centerY,
      offsetX,
      offsetY
    ];
  }
  const handleDirections = {
    [Position.Left]: { x: -1, y: 0 },
    [Position.Right]: { x: 1, y: 0 },
    [Position.Top]: { x: 0, y: -1 },
    [Position.Bottom]: { x: 0, y: 1 }
  };
  function getDirection({
    source,
    sourcePosition = Position.Bottom,
    target
  }) {
    if (sourcePosition === Position.Left || sourcePosition === Position.Right) {
      return source.x < target.x ? { x: 1, y: 0 } : { x: -1, y: 0 };
    }
    return source.y < target.y ? { x: 0, y: 1 } : { x: 0, y: -1 };
  }
  function distance(a, b) {
    return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  }
  function getPoints({
    source,
    sourcePosition = Position.Bottom,
    target,
    targetPosition = Position.Top,
    center,
    offset
  }) {
    const sourceDir = handleDirections[sourcePosition];
    const targetDir = handleDirections[targetPosition];
    const sourceGapped = { x: source.x + sourceDir.x * offset, y: source.y + sourceDir.y * offset };
    const targetGapped = { x: target.x + targetDir.x * offset, y: target.y + targetDir.y * offset };
    const dir = getDirection({
      source: sourceGapped,
      sourcePosition,
      target: targetGapped
    });
    const dirAccessor = dir.x !== 0 ? "x" : "y";
    const currDir = dir[dirAccessor];
    let points;
    let centerX, centerY;
    const sourceGapOffset = { x: 0, y: 0 };
    const targetGapOffset = { x: 0, y: 0 };
    const [defaultCenterX, defaultCenterY, defaultOffsetX, defaultOffsetY] = getSimpleEdgeCenter({
      sourceX: source.x,
      sourceY: source.y,
      targetX: target.x,
      targetY: target.y
    });
    if (sourceDir[dirAccessor] * targetDir[dirAccessor] === -1) {
      centerX = center.x || defaultCenterX;
      centerY = center.y || defaultCenterY;
      const verticalSplit = [
        { x: centerX, y: sourceGapped.y },
        { x: centerX, y: targetGapped.y }
      ];
      const horizontalSplit = [
        { x: sourceGapped.x, y: centerY },
        { x: targetGapped.x, y: centerY }
      ];
      if (sourceDir[dirAccessor] === currDir) {
        points = dirAccessor === "x" ? verticalSplit : horizontalSplit;
      } else {
        points = dirAccessor === "x" ? horizontalSplit : verticalSplit;
      }
    } else {
      const sourceTarget = [{ x: sourceGapped.x, y: targetGapped.y }];
      const targetSource = [{ x: targetGapped.x, y: sourceGapped.y }];
      if (dirAccessor === "x") {
        points = sourceDir.x === currDir ? targetSource : sourceTarget;
      } else {
        points = sourceDir.y === currDir ? sourceTarget : targetSource;
      }
      if (sourcePosition === targetPosition) {
        const diff = Math.abs(source[dirAccessor] - target[dirAccessor]);
        if (diff <= offset) {
          const gapOffset = Math.min(offset - 1, offset - diff);
          if (sourceDir[dirAccessor] === currDir) {
            sourceGapOffset[dirAccessor] = (sourceGapped[dirAccessor] > source[dirAccessor] ? -1 : 1) * gapOffset;
          } else {
            targetGapOffset[dirAccessor] = (targetGapped[dirAccessor] > target[dirAccessor] ? -1 : 1) * gapOffset;
          }
        }
      }
      if (sourcePosition !== targetPosition) {
        const dirAccessorOpposite = dirAccessor === "x" ? "y" : "x";
        const isSameDir = sourceDir[dirAccessor] === targetDir[dirAccessorOpposite];
        const sourceGtTargetOppo = sourceGapped[dirAccessorOpposite] > targetGapped[dirAccessorOpposite];
        const sourceLtTargetOppo = sourceGapped[dirAccessorOpposite] < targetGapped[dirAccessorOpposite];
        const flipSourceTarget = sourceDir[dirAccessor] === 1 && (!isSameDir && sourceGtTargetOppo || isSameDir && sourceLtTargetOppo) || sourceDir[dirAccessor] !== 1 && (!isSameDir && sourceLtTargetOppo || isSameDir && sourceGtTargetOppo);
        if (flipSourceTarget) {
          points = dirAccessor === "x" ? sourceTarget : targetSource;
        }
      }
      const sourceGapPoint = { x: sourceGapped.x + sourceGapOffset.x, y: sourceGapped.y + sourceGapOffset.y };
      const targetGapPoint = { x: targetGapped.x + targetGapOffset.x, y: targetGapped.y + targetGapOffset.y };
      const maxXDistance = Math.max(Math.abs(sourceGapPoint.x - points[0].x), Math.abs(targetGapPoint.x - points[0].x));
      const maxYDistance = Math.max(Math.abs(sourceGapPoint.y - points[0].y), Math.abs(targetGapPoint.y - points[0].y));
      if (maxXDistance >= maxYDistance) {
        centerX = (sourceGapPoint.x + targetGapPoint.x) / 2;
        centerY = points[0].y;
      } else {
        centerX = points[0].x;
        centerY = (sourceGapPoint.y + targetGapPoint.y) / 2;
      }
    }
    const pathPoints = [
      source,
      { x: sourceGapped.x + sourceGapOffset.x, y: sourceGapped.y + sourceGapOffset.y },
      ...points,
      { x: targetGapped.x + targetGapOffset.x, y: targetGapped.y + targetGapOffset.y },
      target
    ];
    return [pathPoints, centerX, centerY, defaultOffsetX, defaultOffsetY];
  }
  function getBend(a, b, c, size) {
    const bendSize = Math.min(distance(a, b) / 2, distance(b, c) / 2, size);
    const { x, y } = b;
    if (a.x === x && x === c.x || a.y === y && y === c.y) {
      return `L${x} ${y}`;
    }
    if (a.y === y) {
      const xDir2 = a.x < c.x ? -1 : 1;
      const yDir2 = a.y < c.y ? 1 : -1;
      return `L ${x + bendSize * xDir2},${y}Q ${x},${y} ${x},${y + bendSize * yDir2}`;
    }
    const xDir = a.x < c.x ? 1 : -1;
    const yDir = a.y < c.y ? -1 : 1;
    return `L ${x},${y + bendSize * yDir}Q ${x},${y} ${x + bendSize * xDir},${y}`;
  }
  function getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition = Position.Bottom,
    targetX,
    targetY,
    targetPosition = Position.Top,
    borderRadius = 5,
    centerX,
    centerY,
    offset = 20
  }) {
    const [points, labelX, labelY, offsetX, offsetY] = getPoints({
      source: { x: sourceX, y: sourceY },
      sourcePosition,
      target: { x: targetX, y: targetY },
      targetPosition,
      center: { x: centerX, y: centerY },
      offset
    });
    const path = points.reduce((res, p, i) => {
      let segment;
      if (i > 0 && i < points.length - 1) {
        segment = getBend(points[i - 1], p, points[i + 1], borderRadius);
      } else {
        segment = `${i === 0 ? "M" : "L"}${p.x} ${p.y}`;
      }
      res += segment;
      return res;
    }, "");
    return [path, labelX, labelY, offsetX, offsetY];
  }
  function getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY
  }) {
    const [centerX, centerY, offsetX, offsetY] = getSimpleEdgeCenter({
      sourceX,
      sourceY,
      targetX,
      targetY
    });
    return [`M ${sourceX},${sourceY}L ${targetX},${targetY}`, centerX, centerY, offsetX, offsetY];
  }
  const StraightEdge = vue.defineComponent({
    name: "StraightEdge",
    props: [
      "label",
      "labelStyle",
      "labelShowBg",
      "labelBgStyle",
      "labelBgPadding",
      "labelBgBorderRadius",
      "sourceY",
      "sourceX",
      "targetX",
      "targetY",
      "markerEnd",
      "markerStart",
      "interactionWidth"
    ],
    compatConfig: { MODE: 3 },
    setup(props, { attrs }) {
      return () => {
        const [path, labelX, labelY] = getStraightPath(props);
        return vue.h(_sfc_main$d, {
          path,
          labelX,
          labelY,
          ...attrs,
          ...props
        });
      };
    }
  });
  const StraightEdge$1 = StraightEdge;
  const SmoothStepEdge = vue.defineComponent({
    name: "SmoothStepEdge",
    props: [
      "sourcePosition",
      "targetPosition",
      "label",
      "labelStyle",
      "labelShowBg",
      "labelBgStyle",
      "labelBgPadding",
      "labelBgBorderRadius",
      "sourceY",
      "sourceX",
      "targetX",
      "targetY",
      "borderRadius",
      "markerEnd",
      "markerStart",
      "interactionWidth",
      "offset"
    ],
    compatConfig: { MODE: 3 },
    setup(props, { attrs }) {
      return () => {
        const [path, labelX, labelY] = getSmoothStepPath({
          ...props,
          sourcePosition: props.sourcePosition ?? Position.Bottom,
          targetPosition: props.targetPosition ?? Position.Top
        });
        return vue.h(_sfc_main$d, {
          path,
          labelX,
          labelY,
          ...attrs,
          ...props
        });
      };
    }
  });
  const SmoothStepEdge$1 = SmoothStepEdge;
  const StepEdge = vue.defineComponent({
    name: "StepEdge",
    props: [
      "sourcePosition",
      "targetPosition",
      "label",
      "labelStyle",
      "labelShowBg",
      "labelBgStyle",
      "labelBgPadding",
      "labelBgBorderRadius",
      "sourceY",
      "sourceX",
      "targetX",
      "targetY",
      "markerEnd",
      "markerStart",
      "interactionWidth"
    ],
    setup(props, { attrs }) {
      return () => vue.h(SmoothStepEdge$1, { ...props, ...attrs, borderRadius: 0 });
    }
  });
  const StepEdge$1 = StepEdge;
  const BezierEdge = vue.defineComponent({
    name: "BezierEdge",
    props: [
      "sourcePosition",
      "targetPosition",
      "label",
      "labelStyle",
      "labelShowBg",
      "labelBgStyle",
      "labelBgPadding",
      "labelBgBorderRadius",
      "sourceY",
      "sourceX",
      "targetX",
      "targetY",
      "curvature",
      "markerEnd",
      "markerStart",
      "interactionWidth"
    ],
    compatConfig: { MODE: 3 },
    setup(props, { attrs }) {
      return () => {
        const [path, labelX, labelY] = getBezierPath({
          ...props,
          sourcePosition: props.sourcePosition ?? Position.Bottom,
          targetPosition: props.targetPosition ?? Position.Top
        });
        return vue.h(_sfc_main$d, {
          path,
          labelX,
          labelY,
          ...attrs,
          ...props
        });
      };
    }
  });
  const BezierEdge$1 = BezierEdge;
  const SimpleBezierEdge = vue.defineComponent({
    name: "SimpleBezierEdge",
    props: [
      "sourcePosition",
      "targetPosition",
      "label",
      "labelStyle",
      "labelShowBg",
      "labelBgStyle",
      "labelBgPadding",
      "labelBgBorderRadius",
      "sourceY",
      "sourceX",
      "targetX",
      "targetY",
      "markerEnd",
      "markerStart",
      "interactionWidth"
    ],
    compatConfig: { MODE: 3 },
    setup(props, { attrs }) {
      return () => {
        const [path, labelX, labelY] = getSimpleBezierPath({
          ...props,
          sourcePosition: props.sourcePosition ?? Position.Bottom,
          targetPosition: props.targetPosition ?? Position.Top
        });
        return vue.h(_sfc_main$d, {
          path,
          labelX,
          labelY,
          ...attrs,
          ...props
        });
      };
    }
  });
  const SimpleBezierEdge$1 = SimpleBezierEdge;
  const defaultNodeTypes = {
    input: InputNode$1,
    default: DefaultNode$1,
    output: OutputNode$1
  };
  const defaultEdgeTypes = {
    default: BezierEdge$1,
    straight: StraightEdge$1,
    step: StepEdge$1,
    smoothstep: SmoothStepEdge$1,
    simplebezier: SimpleBezierEdge$1
  };
  function useGetters(state, nodeIds, edgeIds) {
    const getNode = vue.computed(() => (id2) => {
      if (state.nodes && !nodeIds.value.length) {
        return state.nodes.find((node) => node.id === id2);
      }
      return state.nodes[nodeIds.value.indexOf(id2)];
    });
    const getEdge = vue.computed(() => (id2) => {
      if (state.edges && !edgeIds.value.length) {
        return state.edges.find((edge) => edge.id === id2);
      }
      return state.edges[edgeIds.value.indexOf(id2)];
    });
    const getEdgeTypes = vue.computed(() => {
      const edgeTypes = {
        ...defaultEdgeTypes,
        ...state.edgeTypes
      };
      const keys = Object.keys(edgeTypes);
      for (const e of state.edges) {
        e.type && !keys.includes(e.type) && (edgeTypes[e.type] = e.type);
      }
      return edgeTypes;
    });
    const getNodeTypes = vue.computed(() => {
      const nodeTypes = {
        ...defaultNodeTypes,
        ...state.nodeTypes
      };
      const keys = Object.keys(nodeTypes);
      for (const n of state.nodes) {
        n.type && !keys.includes(n.type) && (nodeTypes[n.type] = n.type);
      }
      return nodeTypes;
    });
    const getNodes = vue.computed(() => {
      const nodes = state.nodes.filter((n) => !n.hidden);
      return state.onlyRenderVisibleElements ? nodes && getNodesInside(
        nodes,
        {
          x: 0,
          y: 0,
          width: state.dimensions.width,
          height: state.dimensions.height
        },
        state.viewport,
        true
      ) : nodes ?? [];
    });
    const edgeHidden = (e, source, target) => {
      source = source ?? getNode.value(e.source);
      target = target ?? getNode.value(e.target);
      if (!source || !target) {
        state.hooks.error.trigger(new VueFlowError(ErrorCode.EDGE_ORPHANED, e.id));
        return;
      }
      return !e.hidden && !target.hidden && !source.hidden;
    };
    const getEdges = vue.computed(() => {
      if (!state.onlyRenderVisibleElements) {
        return state.edges.filter((edge) => edgeHidden(edge));
      }
      return state.edges.filter((e) => {
        const source = getNode.value(e.source);
        const target = getNode.value(e.target);
        return edgeHidden(e, source, target) && isEdgeVisible({
          sourcePos: source.computedPosition || { x: 0, y: 0 },
          targetPos: target.computedPosition || { x: 0, y: 0 },
          sourceWidth: source.dimensions.width,
          sourceHeight: source.dimensions.height,
          targetWidth: target.dimensions.width,
          targetHeight: target.dimensions.height,
          width: state.dimensions.width,
          height: state.dimensions.height,
          viewport: state.viewport
        });
      });
    });
    const getElements = vue.computed(() => [...getNodes.value, ...getEdges.value]);
    const getSelectedNodes = vue.computed(() => state.nodes.filter((n) => n.selected));
    const getSelectedEdges = vue.computed(() => state.edges.filter((e) => e.selected));
    const getSelectedElements = vue.computed(() => [
      ...getSelectedNodes.value ?? [],
      ...getSelectedEdges.value ?? []
    ]);
    const getNodesInitialized = vue.computed(
      () => getNodes.value.filter((n) => n.initialized && n.handleBounds !== void 0)
    );
    const areNodesInitialized = vue.computed(
      () => getNodes.value.length > 0 && getNodesInitialized.value.length === getNodes.value.length
    );
    return {
      getNode,
      getEdge,
      getElements,
      getEdgeTypes,
      getNodeTypes,
      getEdges,
      getNodes,
      getSelectedElements,
      getSelectedNodes,
      getSelectedEdges,
      getNodesInitialized,
      areNodesInitialized
    };
  }
  class Storage {
    constructor() {
      this.currentId = 0;
      this.flows = /* @__PURE__ */ new Map();
    }
    static getInstance() {
      if (!Storage.instance) {
        Storage.instance = new Storage();
      }
      return Storage.instance;
    }
    set(id2, flow) {
      return this.flows.set(id2, flow);
    }
    get(id2) {
      return this.flows.get(id2);
    }
    remove(id2) {
      return this.flows.delete(id2);
    }
    create(id2, preloadedState) {
      const state = useState();
      const reactiveState = vue.reactive(state);
      const hooksOn = {};
      for (const [n, h] of Object.entries(reactiveState.hooks)) {
        const name = `on${n.charAt(0).toUpperCase() + n.slice(1)}`;
        hooksOn[name] = h.on;
      }
      const emits = {};
      for (const [n, h] of Object.entries(reactiveState.hooks)) {
        emits[n] = h.trigger;
      }
      const nodeIds = vue.computed(() => reactiveState.nodes.map((n) => n.id));
      const edgeIds = vue.computed(() => reactiveState.edges.map((e) => e.id));
      const getters = useGetters(reactiveState, nodeIds, edgeIds);
      const actions = useActions(id2, reactiveState, nodeIds, edgeIds);
      actions.setState({ ...reactiveState, ...preloadedState });
      const flow = {
        ...hooksOn,
        ...getters,
        ...actions,
        ...toRefs(reactiveState),
        emits,
        id: id2,
        vueFlowVersion: "1.33.1",
        $destroy: () => {
          this.remove(id2);
        }
      };
      this.set(id2, flow);
      return flow;
    }
    getId() {
      return `vue-flow-${this.currentId++}`;
    }
  }
  function useVueFlow(options) {
    const storage = Storage.getInstance();
    const scope = vue.getCurrentScope();
    const id2 = options == null ? void 0 : options.id;
    const vueFlowId = (scope == null ? void 0 : scope.vueFlowId) || id2;
    let vueFlow;
    if (scope) {
      const injection = vue.inject(VueFlow, null);
      if (typeof injection !== "undefined" && injection !== null) {
        vueFlow = injection;
      }
    }
    if (!vueFlow) {
      if (vueFlowId) {
        vueFlow = storage.get(vueFlowId);
      }
    }
    if (!vueFlow || vueFlow && id2 && id2 !== vueFlow.id) {
      const name = id2 ?? storage.getId();
      const state = storage.create(name, options);
      vueFlow = state;
      vue.effectScope().run(() => {
        vue.watch(
          state.applyDefault,
          (shouldApplyDefault, __, onCleanup) => {
            const nodesChangeHandler = (changes) => {
              state.applyNodeChanges(changes);
            };
            const edgesChangeHandler = (changes) => {
              state.applyEdgeChanges(changes);
            };
            if (shouldApplyDefault) {
              state.onNodesChange(nodesChangeHandler);
              state.onEdgesChange(edgesChangeHandler);
            } else {
              state.hooks.value.nodesChange.off(nodesChangeHandler);
              state.hooks.value.edgesChange.off(edgesChangeHandler);
            }
            onCleanup(() => {
              state.hooks.value.nodesChange.off(nodesChangeHandler);
              state.hooks.value.edgesChange.off(edgesChangeHandler);
            });
          },
          { immediate: true }
        );
        tryOnScopeDispose(() => {
          if (vueFlow) {
            const storedInstance = storage.get(vueFlow.id);
            if (storedInstance) {
              storedInstance.$destroy();
            } else {
              warn(`No store instance found for id ${vueFlow.id} in storage.`);
            }
          }
        });
      });
    } else {
      if (options) {
        vueFlow.setState(options);
      }
    }
    if (scope) {
      vue.provide(VueFlow, vueFlow);
      scope.vueFlowId = vueFlow.id;
    }
    return vueFlow;
  }
  function useResizeHandler(viewportEl) {
    const window2 = useWindow();
    const { emits, dimensions } = useVueFlow();
    let resizeObserver;
    vue.onMounted(() => {
      const rendererNode = viewportEl.value;
      const updateDimensions = () => {
        if (!rendererNode) {
          return;
        }
        const size = getDimensions(rendererNode);
        if (size.width === 0 || size.height === 0) {
          emits.error(new VueFlowError(ErrorCode.MISSING_VIEWPORT_DIMENSIONS));
        }
        dimensions.value = { width: size.width || 500, height: size.height || 500 };
      };
      updateDimensions();
      window2.addEventListener("resize", updateDimensions);
      if (rendererNode) {
        resizeObserver = new ResizeObserver(() => updateDimensions());
        resizeObserver.observe(rendererNode);
      }
      vue.onBeforeUnmount(() => {
        window2.removeEventListener("resize", updateDimensions);
        if (resizeObserver && rendererNode) {
          resizeObserver.unobserve(rendererNode);
        }
      });
    });
  }
  const __default__$c = {
    name: "UserSelection",
    compatConfig: { MODE: 3 }
  };
  const _sfc_main$c = /* @__PURE__ */ vue.defineComponent({
    ...__default__$c,
    props: {
      userSelectionRect: {}
    },
    setup(__props) {
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", {
          class: "vue-flow__selection vue-flow__container",
          style: vue.normalizeStyle({
            width: `${_ctx.userSelectionRect.width}px`,
            height: `${_ctx.userSelectionRect.height}px`,
            transform: `translate(${_ctx.userSelectionRect.x}px, ${_ctx.userSelectionRect.y}px)`
          })
        }, null, 4);
      };
    }
  });
  const _hoisted_1$6 = ["tabIndex"];
  const __default__$b = {
    name: "NodesSelection",
    compatConfig: { MODE: 3 }
  };
  const _sfc_main$b = /* @__PURE__ */ vue.defineComponent({
    ...__default__$b,
    setup(__props) {
      const __$temp_1 = useVueFlow(), emits = vue.toRef(__$temp_1, "emits"), viewport = vue.toRef(__$temp_1, "viewport"), getSelectedNodes = vue.toRef(__$temp_1, "getSelectedNodes"), noPanClassName = vue.toRef(__$temp_1, "noPanClassName"), disableKeyboardA11y = vue.toRef(__$temp_1, "disableKeyboardA11y"), userSelectionActive = vue.toRef(__$temp_1, "userSelectionActive");
      const updatePositions = useUpdateNodePositions();
      const el = vue.ref(null);
      const dragging = useDrag({
        el,
        onStart(args) {
          emits.value.selectionDragStart(args);
        },
        onDrag(args) {
          emits.value.selectionDrag(args);
        },
        onStop(args) {
          emits.value.selectionDragStop(args);
        }
      });
      vue.onMounted(() => {
        var _a;
        if (!disableKeyboardA11y.value) {
          (_a = el.value) == null ? void 0 : _a.focus({ preventScroll: true });
        }
      });
      const selectedNodesBBox = vue.computed(() => getRectOfNodes(getSelectedNodes.value));
      const innerStyle = vue.computed(() => ({
        width: `${selectedNodesBBox.value.width}px`,
        height: `${selectedNodesBBox.value.height}px`,
        top: `${selectedNodesBBox.value.y}px`,
        left: `${selectedNodesBBox.value.x}px`
      }));
      function onContextMenu(event) {
        emits.value.selectionContextMenu({ event, nodes: getSelectedNodes.value });
      }
      function onKeyDown(event) {
        if (disableKeyboardA11y.value) {
          return;
        }
        if (arrowKeyDiffs[event.key]) {
          updatePositions(
            {
              x: arrowKeyDiffs[event.key].x,
              y: arrowKeyDiffs[event.key].y
            },
            event.shiftKey
          );
        }
      }
      return (_ctx, _cache) => {
        return !userSelectionActive.value && selectedNodesBBox.value.width && selectedNodesBBox.value.height ? (vue.openBlock(), vue.createElementBlock("div", {
          key: 0,
          class: vue.normalizeClass(["vue-flow__nodesselection vue-flow__container", noPanClassName.value]),
          style: vue.normalizeStyle({ transform: `translate(${viewport.value.x}px,${viewport.value.y}px) scale(${viewport.value.zoom})` })
        }, [
          vue.createElementVNode("div", {
            ref_key: "el",
            ref: el,
            class: vue.normalizeClass([{ dragging: vue.unref(dragging) }, "vue-flow__nodesselection-rect"]),
            style: vue.normalizeStyle(innerStyle.value),
            tabIndex: disableKeyboardA11y.value ? void 0 : -1,
            onContextmenu: onContextMenu,
            onKeydown: onKeyDown
          }, null, 46, _hoisted_1$6)
        ], 6)) : vue.createCommentVNode("", true);
      };
    }
  });
  function getMousePosition(event, containerBounds) {
    return {
      x: event.clientX - containerBounds.left,
      y: event.clientY - containerBounds.top
    };
  }
  const __default__$a = {
    name: "Pane",
    compatConfig: { MODE: 3 }
  };
  const _sfc_main$a = /* @__PURE__ */ vue.defineComponent({
    ...__default__$a,
    props: {
      isSelecting: { type: Boolean }
    },
    setup(__props) {
      const {
        vueFlowRef,
        getNodes,
        getEdges,
        viewport,
        emits,
        userSelectionActive,
        removeSelectedElements,
        panOnDrag,
        userSelectionRect,
        elementsSelectable,
        nodesSelectionActive,
        addSelectedElements,
        getSelectedEdges,
        getSelectedNodes,
        removeNodes,
        removeEdges,
        selectionMode,
        deleteKeyCode,
        multiSelectionKeyCode,
        multiSelectionActive
      } = useVueFlow();
      const container = vue.ref(null);
      const prevSelectedNodesCount = vue.ref(0);
      const prevSelectedEdgesCount = vue.ref(0);
      const containerBounds = vue.ref();
      const hasActiveSelection = vue.toRef(() => elementsSelectable.value && (__props.isSelecting || userSelectionActive.value));
      useKeyPress(deleteKeyCode, (keyPressed) => {
        if (!keyPressed) {
          return;
        }
        const nodesToRemove = getNodes.value.reduce((res, node) => {
          if (!node.selected && node.parentNode && res.find((n) => n.id === node.parentNode)) {
            res.push(node);
          } else if (node.selected) {
            res.push(node);
          }
          return res;
        }, []);
        if (nodesToRemove || getSelectedEdges.value) {
          if (getSelectedEdges.value.length > 0) {
            removeEdges(getSelectedEdges.value);
          }
          if (nodesToRemove.length > 0) {
            removeNodes(nodesToRemove);
          }
          nodesSelectionActive.value = false;
          removeSelectedElements();
        }
      });
      useKeyPress(multiSelectionKeyCode, (keyPressed) => {
        multiSelectionActive.value = keyPressed;
      });
      function resetUserSelection() {
        userSelectionActive.value = false;
        userSelectionRect.value = null;
        prevSelectedNodesCount.value = 0;
        prevSelectedEdgesCount.value = 0;
      }
      function onClick(event) {
        if (event.target !== container.value || hasActiveSelection.value) {
          return;
        }
        emits.paneClick(event);
        removeSelectedElements();
        nodesSelectionActive.value = false;
      }
      function onContextMenu(event) {
        var _a;
        if (event.target !== container.value) {
          return;
        }
        if (Array.isArray(panOnDrag.value) && ((_a = panOnDrag.value) == null ? void 0 : _a.includes(2))) {
          event.preventDefault();
          return;
        }
        emits.paneContextMenu(event);
      }
      function onWheel(event) {
        if (event.target !== container.value) {
          return;
        }
        emits.paneScroll(event);
      }
      function onMouseDown(event) {
        containerBounds.value = vueFlowRef.value.getBoundingClientRect();
        if (!hasActiveSelection.value || !elementsSelectable || !__props.isSelecting || event.button !== 0 || event.target !== container.value || !containerBounds.value) {
          return;
        }
        const { x, y } = getMousePosition(event, containerBounds.value);
        removeSelectedElements();
        userSelectionRect.value = {
          width: 0,
          height: 0,
          startX: x,
          startY: y,
          x,
          y
        };
        userSelectionActive.value = true;
        emits.selectionStart(event);
      }
      function onMouseMove(event) {
        if (!hasActiveSelection.value) {
          return emits.paneMouseMove(event);
        }
        if (!__props.isSelecting || !containerBounds.value || !userSelectionRect.value) {
          return;
        }
        if (!userSelectionActive.value) {
          userSelectionActive.value = true;
        }
        if (nodesSelectionActive.value) {
          nodesSelectionActive.value = false;
        }
        const mousePos = getMousePosition(event, containerBounds.value);
        const startX = userSelectionRect.value.startX ?? 0;
        const startY = userSelectionRect.value.startY ?? 0;
        const nextUserSelectRect = {
          ...userSelectionRect.value,
          x: mousePos.x < startX ? mousePos.x : startX,
          y: mousePos.y < startY ? mousePos.y : startY,
          width: Math.abs(mousePos.x - startX),
          height: Math.abs(mousePos.y - startY)
        };
        const selectedNodes = getNodesInside(
          getNodes.value,
          userSelectionRect.value,
          viewport.value,
          selectionMode.value === SelectionMode.Partial
        );
        const selectedEdges = getConnectedEdges(selectedNodes, getEdges.value);
        prevSelectedNodesCount.value = selectedNodes.length;
        prevSelectedEdgesCount.value = selectedEdges.length;
        userSelectionRect.value = nextUserSelectRect;
        addSelectedElements([...selectedNodes, ...selectedEdges]);
      }
      function onMouseUp(event) {
        if (!hasActiveSelection.value) {
          return;
        }
        if (event.button !== 0) {
          return;
        }
        if (!userSelectionActive.value && userSelectionRect.value && event.target === container.value) {
          onClick(event);
        }
        nodesSelectionActive.value = prevSelectedNodesCount.value > 0;
        resetUserSelection();
        emits.selectionEnd(event);
      }
      function onMouseLeave(event) {
        var _a;
        if (!hasActiveSelection.value) {
          return emits.paneMouseLeave(event);
        }
        if (userSelectionActive.value) {
          nodesSelectionActive.value = prevSelectedNodesCount.value > 0;
          (_a = emits.selectionEnd) == null ? void 0 : _a.call(emits, event);
        }
        resetUserSelection();
      }
      function onMouseEnter(event) {
        if (hasActiveSelection.value) {
          return;
        }
        emits.paneMouseEnter(event);
      }
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", {
          ref_key: "container",
          ref: container,
          class: vue.normalizeClass(["vue-flow__pane vue-flow__container", { selection: _ctx.isSelecting }]),
          onClick,
          onContextmenu: onContextMenu,
          onWheelPassive: onWheel,
          onMouseenter: onMouseEnter,
          onMousedown: onMouseDown,
          onMousemove: onMouseMove,
          onMouseup: onMouseUp,
          onMouseleave: onMouseLeave
        }, [
          vue.renderSlot(_ctx.$slots, "default"),
          vue.unref(userSelectionActive) && vue.unref(userSelectionRect) ? (vue.openBlock(), vue.createBlock(_sfc_main$c, {
            key: 0,
            "user-selection-rect": vue.unref(userSelectionRect)
          }, null, 8, ["user-selection-rect"])) : vue.createCommentVNode("", true),
          vue.unref(nodesSelectionActive) && vue.unref(getSelectedNodes).length ? (vue.openBlock(), vue.createBlock(_sfc_main$b, { key: 1 })) : vue.createCommentVNode("", true)
        ], 34);
      };
    }
  });
  const __default__$9 = {
    name: "Transform",
    compatConfig: { MODE: 3 }
  };
  const _sfc_main$9 = /* @__PURE__ */ vue.defineComponent({
    ...__default__$9,
    setup(__props) {
      const { viewport } = useVueFlow();
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", {
          class: "vue-flow__transformationpane vue-flow__container",
          style: vue.normalizeStyle({ transform: `translate(${vue.unref(viewport).x}px,${vue.unref(viewport).y}px) scale(${vue.unref(viewport).zoom})` })
        }, [
          vue.renderSlot(_ctx.$slots, "default")
        ], 4);
      };
    }
  });
  const __default__$8 = {
    name: "Viewport",
    compatConfig: { MODE: 3 }
  };
  const _sfc_main$8 = /* @__PURE__ */ vue.defineComponent({
    ...__default__$8,
    setup(__props) {
      const {
        minZoom,
        maxZoom,
        defaultViewport,
        translateExtent,
        zoomActivationKeyCode,
        selectionKeyCode,
        panActivationKeyCode,
        panOnScroll,
        panOnScrollMode,
        panOnScrollSpeed,
        panOnDrag,
        zoomOnDoubleClick,
        zoomOnPinch,
        zoomOnScroll,
        preventScrolling,
        noWheelClassName,
        noPanClassName,
        emits,
        connectionStartHandle,
        userSelectionActive,
        paneDragging,
        d3Zoom: storeD3Zoom,
        d3Selection: storeD3Selection,
        d3ZoomHandler: storeD3ZoomHandler,
        viewport,
        viewportRef
      } = useVueFlow();
      useResizeHandler(viewportRef);
      const isZoomingOrPanning = vue.ref(false);
      const isPanScrolling = vue.ref(false);
      let panScrollTimeout = null;
      let zoomedWithRightMouseButton = false;
      let mouseButton = 0;
      let prevTransform = {
        x: 0,
        y: 0,
        zoom: 0
      };
      const panKeyPressed = useKeyPress(panActivationKeyCode);
      const selectionKeyPressed = useKeyPress(selectionKeyCode);
      const zoomKeyPressed = useKeyPress(zoomActivationKeyCode);
      const shouldPanOnDrag = vue.toRef(() => panKeyPressed.value || panOnDrag.value);
      const shouldPanOnScroll = vue.toRef(() => panKeyPressed.value || panOnScroll.value);
      const isSelecting = vue.toRef(() => selectionKeyPressed.value || selectionKeyCode.value === true && shouldPanOnDrag.value !== true);
      vue.onMounted(() => {
        if (!viewportRef.value) {
          warn("Viewport element is missing");
          return;
        }
        const viewportElement = viewportRef.value;
        const bbox = viewportElement.getBoundingClientRect();
        const d3Zoom = zoom().scaleExtent([minZoom.value, maxZoom.value]).translateExtent(translateExtent.value);
        const d3Selection = select(viewportElement).call(d3Zoom);
        const d3ZoomHandler = d3Selection.on("wheel.zoom");
        const updatedTransform = identity.translate(defaultViewport.value.x ?? 0, defaultViewport.value.y ?? 0).scale(clamp(defaultViewport.value.zoom ?? 1, minZoom.value, maxZoom.value));
        const extent = [
          [0, 0],
          [bbox.width, bbox.height]
        ];
        const constrainedTransform = d3Zoom.constrain()(updatedTransform, extent, translateExtent.value);
        d3Zoom.transform(d3Selection, constrainedTransform);
        d3Zoom.wheelDelta(wheelDelta);
        storeD3Zoom.value = d3Zoom;
        storeD3Selection.value = d3Selection;
        storeD3ZoomHandler.value = d3ZoomHandler;
        viewport.value = { x: constrainedTransform.x, y: constrainedTransform.y, zoom: constrainedTransform.k };
        d3Zoom.on("start", (event) => {
          var _a;
          if (!event.sourceEvent) {
            return null;
          }
          mouseButton = event.sourceEvent.button;
          isZoomingOrPanning.value = true;
          const flowTransform = eventToFlowTransform(event.transform);
          if (((_a = event.sourceEvent) == null ? void 0 : _a.type) === "mousedown") {
            paneDragging.value = true;
          }
          prevTransform = flowTransform;
          emits.viewportChangeStart(flowTransform);
          emits.moveStart({ event, flowTransform });
        });
        d3Zoom.on("end", (event) => {
          if (!event.sourceEvent) {
            return null;
          }
          isZoomingOrPanning.value = false;
          paneDragging.value = false;
          if (isRightClickPan(shouldPanOnDrag.value, mouseButton ?? 0) && !zoomedWithRightMouseButton) {
            emits.paneContextMenu(event.sourceEvent);
          }
          zoomedWithRightMouseButton = false;
          if (viewChanged(prevTransform, event.transform)) {
            const flowTransform = eventToFlowTransform(event.transform);
            prevTransform = flowTransform;
            emits.viewportChangeEnd(flowTransform);
            emits.moveEnd({ event, flowTransform });
          }
        });
        d3Zoom.filter((event) => {
          var _a, _b;
          const zoomScroll = zoomKeyPressed.value || zoomOnScroll.value;
          const pinchZoom = zoomOnPinch.value && event.ctrlKey;
          if ((shouldPanOnDrag.value === true || Array.isArray(shouldPanOnDrag.value) && shouldPanOnDrag.value.includes(1)) && event.button === 1 && event.type === "mousedown" && (((_a = event.target) == null ? void 0 : _a.closest(".vue-flow__node")) || ((_b = event.target) == null ? void 0 : _b.closest(".vue-flow__edge")))) {
            return true;
          }
          if (!shouldPanOnDrag.value && !zoomScroll && !shouldPanOnScroll.value && !zoomOnDoubleClick.value && !zoomOnPinch.value) {
            return false;
          }
          if (userSelectionActive.value) {
            return false;
          }
          if (!zoomOnDoubleClick.value && event.type === "dblclick") {
            return false;
          }
          if (isWrappedWithClass(event, noWheelClassName.value) && event.type === "wheel") {
            return false;
          }
          if (isWrappedWithClass(event, noPanClassName.value) && (event.type !== "wheel" || shouldPanOnScroll.value && event.type === "wheel" && !zoomKeyPressed.value)) {
            return false;
          }
          if (!zoomOnPinch.value && event.ctrlKey && event.type === "wheel") {
            return false;
          }
          if (!zoomScroll && !shouldPanOnScroll.value && !pinchZoom && event.type === "wheel") {
            return false;
          }
          if (!shouldPanOnDrag.value && (event.type === "mousedown" || event.type === "touchstart")) {
            return false;
          }
          if (Array.isArray(shouldPanOnDrag.value) && !shouldPanOnDrag.value.includes(event.button) && (event.type === "mousedown" || event.type === "touchstart")) {
            return false;
          }
          const buttonAllowed = Array.isArray(shouldPanOnDrag.value) && shouldPanOnDrag.value.includes(event.button) || !event.button || event.button <= 1;
          return (!event.ctrlKey || event.type === "wheel") && buttonAllowed;
        });
        vue.watch(
          [userSelectionActive, shouldPanOnDrag],
          () => {
            if (userSelectionActive.value && !isZoomingOrPanning.value) {
              d3Zoom.on("zoom", null);
            } else if (!userSelectionActive.value) {
              d3Zoom.on("zoom", (event) => {
                viewport.value = { x: event.transform.x, y: event.transform.y, zoom: event.transform.k };
                const flowTransform = eventToFlowTransform(event.transform);
                zoomedWithRightMouseButton = isRightClickPan(shouldPanOnDrag.value, mouseButton ?? 0);
                emits.viewportChange(flowTransform);
                emits.move({ event, flowTransform });
              });
            }
          },
          { immediate: true }
        );
        vue.watch(
          [userSelectionActive, shouldPanOnScroll, panOnScrollMode, zoomKeyPressed, zoomOnPinch, preventScrolling, noWheelClassName],
          () => {
            if (shouldPanOnScroll.value && !zoomKeyPressed.value && !userSelectionActive.value) {
              d3Selection.on(
                "wheel.zoom",
                (event) => {
                  if (isWrappedWithClass(event, noWheelClassName.value)) {
                    return false;
                  }
                  event.preventDefault();
                  event.stopImmediatePropagation();
                  const currentZoom = d3Selection.property("__zoom").k || 1;
                  const _isMacOs = isMacOs();
                  if (event.ctrlKey && zoomOnPinch.value && _isMacOs) {
                    const point = pointer(event);
                    const pinchDelta = wheelDelta(event);
                    const zoom2 = currentZoom * 2 ** pinchDelta;
                    d3Zoom.scaleTo(d3Selection, zoom2, point, event);
                    return;
                  }
                  const deltaNormalize = event.deltaMode === 1 ? 20 : 1;
                  let deltaX = panOnScrollMode.value === PanOnScrollMode.Vertical ? 0 : event.deltaX * deltaNormalize;
                  let deltaY = panOnScrollMode.value === PanOnScrollMode.Horizontal ? 0 : event.deltaY * deltaNormalize;
                  if (!_isMacOs && event.shiftKey && panOnScrollMode.value !== PanOnScrollMode.Vertical && !deltaX && deltaY) {
                    deltaX = deltaY;
                    deltaY = 0;
                  }
                  d3Zoom.translateBy(
                    d3Selection,
                    -(deltaX / currentZoom) * panOnScrollSpeed.value,
                    -(deltaY / currentZoom) * panOnScrollSpeed.value
                  );
                  const nextViewport = eventToFlowTransform(d3Selection.property("__zoom"));
                  if (panScrollTimeout) {
                    clearTimeout(panScrollTimeout);
                  }
                  if (!isPanScrolling.value) {
                    isPanScrolling.value = true;
                    emits.moveStart({ event, flowTransform: nextViewport });
                    emits.viewportChangeStart(nextViewport);
                  } else {
                    emits.move({ event, flowTransform: nextViewport });
                    emits.viewportChange(nextViewport);
                    panScrollTimeout = setTimeout(() => {
                      emits.moveEnd({ event, flowTransform: nextViewport });
                      emits.viewportChangeEnd(nextViewport);
                      isPanScrolling.value = false;
                    }, 150);
                  }
                },
                { passive: false }
              );
            } else if (typeof d3ZoomHandler !== "undefined") {
              d3Selection.on(
                "wheel.zoom",
                function(event, d) {
                  if (!preventScrolling.value || isWrappedWithClass(event, noWheelClassName.value)) {
                    return null;
                  }
                  event.preventDefault();
                  d3ZoomHandler.call(this, event, d);
                },
                { passive: false }
              );
            }
          },
          { immediate: true }
        );
      });
      function isRightClickPan(pan, usedButton) {
        return usedButton === 2 && Array.isArray(pan) && pan.includes(2);
      }
      function wheelDelta(event) {
        const factor = event.ctrlKey && isMacOs() ? 10 : 1;
        return -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 2e-3) * factor;
      }
      function viewChanged(prevViewport, eventTransform) {
        return prevViewport.x !== eventTransform.x && !Number.isNaN(eventTransform.x) || prevViewport.y !== eventTransform.y && !Number.isNaN(eventTransform.y) || prevViewport.zoom !== eventTransform.k && !Number.isNaN(eventTransform.k);
      }
      function eventToFlowTransform(eventTransform) {
        return {
          x: eventTransform.x,
          y: eventTransform.y,
          zoom: eventTransform.k
        };
      }
      function isWrappedWithClass(event, className) {
        return event.target.closest(`.${className}`);
      }
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", {
          ref_key: "viewportRef",
          ref: viewportRef,
          class: "vue-flow__viewport vue-flow__container"
        }, [
          vue.createVNode(_sfc_main$a, {
            "is-selecting": isSelecting.value,
            class: vue.normalizeClass({ connecting: !!vue.unref(connectionStartHandle), dragging: vue.unref(paneDragging), draggable: shouldPanOnDrag.value })
          }, {
            default: vue.withCtx(() => [
              vue.createVNode(_sfc_main$9, null, {
                default: vue.withCtx(() => [
                  vue.renderSlot(_ctx.$slots, "default")
                ]),
                _: 3
              })
            ]),
            _: 3
          }, 8, ["is-selecting", "class"])
        ], 512);
      };
    }
  });
  const _hoisted_1$5 = ["id"];
  const _hoisted_2 = ["id"];
  const _hoisted_3 = ["id"];
  const __default__$7 = {
    name: "A11yDescriptions",
    compatConfig: { MODE: 3 }
  };
  const _sfc_main$7 = /* @__PURE__ */ vue.defineComponent({
    ...__default__$7,
    setup(__props) {
      const { id: id2, disableKeyboardA11y, ariaLiveMessage } = useVueFlow();
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock(vue.Fragment, null, [
          vue.createElementVNode("div", {
            id: `${vue.unref(ARIA_NODE_DESC_KEY)}-${vue.unref(id2)}`,
            style: { "display": "none" }
          }, " Press enter or space to select a node. " + vue.toDisplayString(!vue.unref(disableKeyboardA11y) ? "You can then use the arrow keys to move the node around." : "") + " You can then use the arrow keys to move the node around, press delete to remove it and press escape to cancel. ", 9, _hoisted_1$5),
          vue.createElementVNode("div", {
            id: `${vue.unref(ARIA_EDGE_DESC_KEY)}-${vue.unref(id2)}`,
            style: { "display": "none" }
          }, " Press enter or space to select an edge. You can then press delete to remove it or press escape to cancel. ", 8, _hoisted_2),
          !vue.unref(disableKeyboardA11y) ? (vue.openBlock(), vue.createElementBlock("div", {
            key: 0,
            id: `${vue.unref(ARIA_LIVE_MESSAGE)}-${vue.unref(id2)}`,
            "aria-live": "assertive",
            "aria-atomic": "true",
            style: { "position": "absolute", "width": "1px", "height": "1px", "margin": "-1px", "border": "0", "padding": "0", "overflow": "hidden", "clip": "rect(0px, 0px, 0px, 0px)", "clip-path": "inset(100%)" }
          }, vue.toDisplayString(vue.unref(ariaLiveMessage)), 9, _hoisted_3)) : vue.createCommentVNode("", true)
        ], 64);
      };
    }
  });
  function useOnInitHandler() {
    const vfInstance = useVueFlow();
    vue.watch(
      () => vfInstance.viewportHelper.value.viewportInitialized,
      (isInitialized) => {
        if (isInitialized) {
          setTimeout(() => {
            vfInstance.emits.init(vfInstance);
            vfInstance.emits.paneReady(vfInstance);
          }, 1);
        }
      }
    );
  }
  function shiftX(x, shift, position) {
    if (position === Position.Left) {
      return x - shift;
    }
    if (position === Position.Right) {
      return x + shift;
    }
    return x;
  }
  function shiftY(y, shift, position) {
    if (position === Position.Top) {
      return y - shift;
    }
    if (position === Position.Bottom) {
      return y + shift;
    }
    return y;
  }
  const EdgeAnchor = function({
    radius = 10,
    centerX = 0,
    centerY = 0,
    position = Position.Top,
    type
  }) {
    return vue.h("circle", {
      class: `vue-flow__edgeupdater vue-flow__edgeupdater-${type}`,
      cx: shiftX(centerX, radius, position),
      cy: shiftY(centerY, radius, position),
      r: radius,
      stroke: "transparent",
      fill: "transparent"
    });
  };
  EdgeAnchor.props = ["radius", "centerX", "centerY", "position", "type"];
  EdgeAnchor.compatConfig = { MODE: 3 };
  const EdgeAnchor$1 = EdgeAnchor;
  const EdgeWrapper = vue.defineComponent({
    name: "Edge",
    compatConfig: { MODE: 3 },
    props: ["name", "type", "id", "updatable", "selectable", "focusable", "edge"],
    setup(props) {
      const {
        id: vueFlowId,
        addSelectedEdges,
        connectionMode,
        edgeUpdaterRadius,
        emits,
        nodesSelectionActive,
        noPanClassName,
        getEdgeTypes,
        removeSelectedEdges,
        findEdge,
        findNode,
        isValidConnection,
        multiSelectionActive,
        disableKeyboardA11y
      } = useVueFlow();
      const hooks = useEdgeHooks(props.edge, emits);
      const edge = useVModel(props, "edge");
      const mouseOver = vue.ref(false);
      const updating = vue.ref(false);
      const nodeId = vue.ref("");
      const handleId = vue.ref(null);
      const edgeUpdaterType = vue.ref("source");
      const edgeEl = vue.ref(null);
      vue.provide(EdgeId, props.id);
      vue.provide(EdgeRef, edgeEl);
      const edgeClass = vue.computed(() => edge.value.class instanceof Function ? edge.value.class(edge.value) : edge.value.class);
      const edgeStyle = vue.computed(() => edge.value.style instanceof Function ? edge.value.style(edge.value) : edge.value.style);
      const { handlePointerDown } = useHandle({
        nodeId,
        handleId,
        type: edgeUpdaterType,
        isValidConnection,
        edgeUpdaterType,
        onEdgeUpdate,
        onEdgeUpdateEnd
      });
      return () => {
        const sourceNode = findNode(edge.value.source);
        const targetNode = findNode(edge.value.target);
        if (!sourceNode && !targetNode) {
          emits.error(new VueFlowError(ErrorCode.EDGE_SOURCE_TARGET_MISSING, edge.value.id, edge.value.source, edge.value.target));
          return null;
        }
        if (!sourceNode) {
          emits.error(new VueFlowError(ErrorCode.EDGE_SOURCE_MISSING, edge.value.id, edge.value.source));
          return null;
        }
        if (!targetNode) {
          emits.error(new VueFlowError(ErrorCode.EDGE_TARGET_MISSING, edge.value.id, edge.value.target));
          return null;
        }
        if (!edge || sourceNode.hidden || targetNode.hidden) {
          return null;
        }
        let sourceNodeHandles;
        if (connectionMode.value === ConnectionMode.Strict) {
          sourceNodeHandles = sourceNode.handleBounds.source;
        } else {
          sourceNodeHandles = [...sourceNode.handleBounds.source || [], ...sourceNode.handleBounds.target || []];
        }
        const sourceHandle = getHandle(sourceNodeHandles, edge.value.sourceHandle);
        let targetNodeHandles;
        if (connectionMode.value === ConnectionMode.Strict) {
          targetNodeHandles = targetNode.handleBounds.target;
        } else {
          targetNodeHandles = [...targetNode.handleBounds.target || [], ...targetNode.handleBounds.source || []];
        }
        const targetHandle = getHandle(targetNodeHandles, edge.value.targetHandle);
        const sourcePosition = sourceHandle ? sourceHandle.position : Position.Bottom;
        const targetPosition = targetHandle ? targetHandle.position : Position.Top;
        const { sourceX, sourceY, targetY, targetX } = getEdgePositions(
          sourceNode,
          sourceHandle,
          sourcePosition,
          targetNode,
          targetHandle,
          targetPosition
        );
        edge.value.sourceX = sourceX;
        edge.value.sourceY = sourceY;
        edge.value.targetX = targetX;
        edge.value.targetY = targetY;
        return vue.h(
          "g",
          {
            "ref": edgeEl,
            "key": props.id,
            "data-id": props.id,
            "class": [
              "vue-flow__edge",
              `vue-flow__edge-${props.type === false ? "default" : props.name}`,
              noPanClassName.value,
              edgeClass.value,
              {
                updating: mouseOver.value,
                selected: edge.value.selected,
                animated: edge.value.animated,
                inactive: !props.selectable
              }
            ],
            "onClick": onEdgeClick,
            "onContextmenu": onEdgeContextMenu,
            "onDblclick": onDoubleClick,
            "onMouseenter": onEdgeMouseEnter,
            "onMousemove": onEdgeMouseMove,
            "onMouseleave": onEdgeMouseLeave,
            "onKeyDown": props.focusable ? onKeyDown : void 0,
            "tabIndex": props.focusable ? 0 : void 0,
            "aria-label": edge.value.ariaLabel === null ? void 0 : edge.value.ariaLabel || `Edge from ${edge.value.source} to ${edge.value.target}`,
            "aria-describedby": props.focusable ? `${ARIA_EDGE_DESC_KEY}-${vueFlowId}` : void 0,
            "role": props.focusable ? "button" : "img"
          },
          [
            updating.value ? null : vue.h(props.type === false ? getEdgeTypes.value.default : props.type, {
              id: props.id,
              sourceNode,
              targetNode,
              source: edge.value.source,
              target: edge.value.target,
              type: edge.value.type,
              updatable: props.updatable,
              selected: edge.value.selected,
              animated: edge.value.animated,
              label: edge.value.label,
              labelStyle: edge.value.labelStyle,
              labelShowBg: edge.value.labelShowBg,
              labelBgStyle: edge.value.labelBgStyle,
              labelBgPadding: edge.value.labelBgPadding,
              labelBgBorderRadius: edge.value.labelBgBorderRadius,
              data: edge.value.data,
              events: { ...edge.value.events, ...hooks.on },
              style: edgeStyle.value,
              markerStart: `url('#${getMarkerId(edge.value.markerStart, vueFlowId)}')`,
              markerEnd: `url('#${getMarkerId(edge.value.markerEnd, vueFlowId)}')`,
              sourcePosition,
              targetPosition,
              sourceX,
              sourceY,
              targetX,
              targetY,
              sourceHandleId: edge.value.sourceHandle,
              targetHandleId: edge.value.targetHandle,
              interactionWidth: edge.value.interactionWidth
            }),
            [
              props.updatable === "source" || props.updatable === true ? [
                vue.h(
                  "g",
                  {
                    onMousedown: onEdgeUpdaterSourceMouseDown,
                    onMouseenter: onEdgeUpdaterMouseEnter,
                    onMouseout: onEdgeUpdaterMouseOut
                  },
                  vue.h(EdgeAnchor$1, {
                    "position": sourcePosition,
                    "centerX": sourceX,
                    "centerY": sourceY,
                    "radius": edgeUpdaterRadius.value,
                    "type": "source",
                    "data-type": "source"
                  })
                )
              ] : null,
              props.updatable === "target" || props.updatable === true ? [
                vue.h(
                  "g",
                  {
                    onMousedown: onEdgeUpdaterTargetMouseDown,
                    onMouseenter: onEdgeUpdaterMouseEnter,
                    onMouseout: onEdgeUpdaterMouseOut
                  },
                  vue.h(EdgeAnchor$1, {
                    "position": targetPosition,
                    "centerX": targetX,
                    "centerY": targetY,
                    "radius": edgeUpdaterRadius.value,
                    "type": "target",
                    "data-type": "target"
                  })
                )
              ] : null
            ]
          ]
        );
      };
      function onEdgeUpdaterMouseEnter() {
        mouseOver.value = true;
      }
      function onEdgeUpdaterMouseOut() {
        mouseOver.value = false;
      }
      function onEdgeUpdate(event, connection) {
        hooks.emit.update({ event, edge: edge.value, connection });
      }
      function onEdgeUpdateEnd(event) {
        hooks.emit.updateEnd({ event, edge: edge.value });
        updating.value = false;
      }
      function handleEdgeUpdater(event, isSourceHandle) {
        if (event.button !== 0) {
          return;
        }
        updating.value = true;
        nodeId.value = isSourceHandle ? edge.value.target : edge.value.source;
        handleId.value = (isSourceHandle ? edge.value.targetHandle : edge.value.sourceHandle) ?? "";
        edgeUpdaterType.value = isSourceHandle ? "target" : "source";
        hooks.emit.updateStart({ event, edge: edge.value });
        handlePointerDown(event);
      }
      function onEdgeClick(event) {
        var _a;
        const data = { event, edge: edge.value };
        if (props.selectable) {
          nodesSelectionActive.value = false;
          if (edge.value.selected && multiSelectionActive.value) {
            removeSelectedEdges([edge.value]);
            (_a = edgeEl.value) == null ? void 0 : _a.blur();
          } else {
            addSelectedEdges([edge.value]);
          }
        }
        hooks.emit.click(data);
      }
      function onEdgeContextMenu(event) {
        hooks.emit.contextMenu({ event, edge: edge.value });
      }
      function onDoubleClick(event) {
        hooks.emit.doubleClick({ event, edge: edge.value });
      }
      function onEdgeMouseEnter(event) {
        hooks.emit.mouseEnter({ event, edge: edge.value });
      }
      function onEdgeMouseMove(event) {
        hooks.emit.mouseMove({ event, edge: edge.value });
      }
      function onEdgeMouseLeave(event) {
        hooks.emit.mouseLeave({ event, edge: edge.value });
      }
      function onEdgeUpdaterSourceMouseDown(event) {
        handleEdgeUpdater(event, true);
      }
      function onEdgeUpdaterTargetMouseDown(event) {
        handleEdgeUpdater(event, false);
      }
      function onKeyDown(event) {
        var _a;
        if (!disableKeyboardA11y.value && elementSelectionKeys.includes(event.key) && props.selectable) {
          const unselect = event.key === "Escape";
          if (unselect) {
            (_a = edgeEl.value) == null ? void 0 : _a.blur();
            removeSelectedEdges([findEdge(props.id)]);
          } else {
            addSelectedEdges([findEdge(props.id)]);
          }
        }
      }
    }
  });
  const EdgeWrapper$1 = EdgeWrapper;
  const oppositePosition = {
    [Position.Left]: Position.Right,
    [Position.Right]: Position.Left,
    [Position.Top]: Position.Bottom,
    [Position.Bottom]: Position.Top
  };
  const ConnectionLine = vue.defineComponent({
    name: "ConnectionLine",
    compatConfig: { MODE: 3 },
    setup() {
      var _a;
      const {
        id: id2,
        connectionMode,
        connectionStartHandle,
        connectionEndHandle,
        connectionPosition,
        connectionLineType,
        connectionLineStyle,
        connectionLineOptions,
        connectionStatus,
        viewport,
        findNode
      } = useVueFlow();
      const connectionLineComponent = (_a = vue.inject(Slots)) == null ? void 0 : _a["connection-line"];
      return () => {
        var _a2, _b, _c, _d, _e;
        if (!connectionStartHandle.value) {
          return null;
        }
        const fromNode = findNode(connectionStartHandle.value.nodeId);
        if (!fromNode) {
          return null;
        }
        const handleId = connectionStartHandle.value.handleId;
        const handleType = connectionStartHandle.value.type;
        const targetNode = ((_a2 = connectionEndHandle.value) == null ? void 0 : _a2.handleId) && findNode(connectionEndHandle.value.nodeId) || null;
        const toX = (connectionPosition.value.x - viewport.value.x) / viewport.value.zoom;
        const toY = (connectionPosition.value.y - viewport.value.y) / viewport.value.zoom;
        const fromHandleBounds = fromNode.handleBounds;
        let handleBounds = fromHandleBounds == null ? void 0 : fromHandleBounds[handleType];
        if (connectionMode.value === ConnectionMode.Loose) {
          handleBounds = handleBounds || (fromHandleBounds == null ? void 0 : fromHandleBounds[handleType === "source" ? "target" : "source"]);
        }
        if (!handleBounds) {
          return null;
        }
        const fromHandle = (handleId ? handleBounds.find((d) => d.id === handleId) : handleBounds[0]) ?? null;
        const fromPosition = (fromHandle == null ? void 0 : fromHandle.position) || Position.Top;
        const { x: fromX, y: fromY } = getHandlePosition(
          fromPosition,
          { ...fromNode.dimensions, ...fromNode.computedPosition },
          fromHandle
        );
        const toHandle = targetNode && ((_b = connectionEndHandle.value) == null ? void 0 : _b.handleId) && ((connectionMode.value === ConnectionMode.Strict ? (_c = targetNode.handleBounds[handleType === "source" ? "target" : "source"]) == null ? void 0 : _c.find(
          (d) => {
            var _a3;
            return d.id === ((_a3 = connectionEndHandle.value) == null ? void 0 : _a3.handleId);
          }
        ) : (_d = [...targetNode.handleBounds.source || [], ...targetNode.handleBounds.target || []]) == null ? void 0 : _d.find(
          (d) => {
            var _a3;
            return d.id === ((_a3 = connectionEndHandle.value) == null ? void 0 : _a3.handleId);
          }
        )) || ((_e = targetNode.handleBounds[handleType ?? "target"]) == null ? void 0 : _e[0])) || null;
        const toPosition = fromPosition ? oppositePosition[fromPosition] : null;
        if (!fromPosition || !toPosition) {
          return null;
        }
        const type = connectionLineType.value ?? connectionLineOptions.value.type ?? ConnectionLineType.Bezier;
        let dAttr = "";
        const pathParams = {
          sourceX: fromX,
          sourceY: fromY,
          sourcePosition: fromPosition,
          targetX: toX,
          targetY: toY,
          targetPosition: toPosition
        };
        if (type === ConnectionLineType.Bezier) {
          [dAttr] = getBezierPath(pathParams);
        } else if (type === ConnectionLineType.Step) {
          [dAttr] = getSmoothStepPath({
            ...pathParams,
            borderRadius: 0
          });
        } else if (type === ConnectionLineType.SmoothStep) {
          [dAttr] = getSmoothStepPath(pathParams);
        } else if (type === ConnectionLineType.SimpleBezier) {
          [dAttr] = getSimpleBezierPath(pathParams);
        } else {
          dAttr = `M${fromX},${fromY} ${toX},${toY}`;
        }
        return vue.h(
          "svg",
          { class: "vue-flow__edges vue-flow__connectionline vue-flow__container" },
          vue.h(
            "g",
            { class: "vue-flow__connection" },
            connectionLineComponent ? vue.h(connectionLineComponent, {
              sourceX: fromX,
              sourceY: fromY,
              sourcePosition: fromPosition,
              targetX: toX,
              targetY: toY,
              targetPosition: toPosition,
              sourceNode: fromNode,
              sourceHandle: fromHandle,
              targetNode,
              targetHandle: toHandle,
              markerEnd: `url(#${getMarkerId(connectionLineOptions.value.markerEnd, id2)})`,
              markerStart: `url(#${getMarkerId(connectionLineOptions.value.markerStart, id2)})`,
              connectionStatus: connectionStatus.value
            }) : vue.h("path", {
              "d": dAttr,
              "class": [connectionLineOptions.value.class, connectionStatus, "vue-flow__connection-path"],
              "style": {
                ...connectionLineStyle.value,
                ...connectionLineOptions.value.style
              },
              "marker-end": `url(#${getMarkerId(connectionLineOptions.value.markerEnd, id2)})`,
              "marker-start": `url(#${getMarkerId(connectionLineOptions.value.markerStart, id2)})`
            })
          )
        );
      };
    }
  });
  const ConnectionLine$1 = ConnectionLine;
  const _hoisted_1$4 = ["id", "markerWidth", "markerHeight", "markerUnits", "orient"];
  const __default__$6 = {
    name: "MarkerType",
    compatConfig: { MODE: 3 }
  };
  const _sfc_main$6 = /* @__PURE__ */ vue.defineComponent({
    ...__default__$6,
    props: {
      id: {},
      type: {},
      color: { default: "none" },
      width: { default: 12.5 },
      height: { default: 12.5 },
      markerUnits: { default: "strokeWidth" },
      orient: { default: "auto-start-reverse" },
      strokeWidth: { default: 1 }
    },
    setup(__props) {
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("marker", {
          id: _ctx.id,
          class: "vue-flow__arrowhead",
          viewBox: "-10 -10 20 20",
          refX: "0",
          refY: "0",
          markerWidth: `${_ctx.width}`,
          markerHeight: `${_ctx.height}`,
          markerUnits: _ctx.markerUnits,
          orient: _ctx.orient
        }, [
          _ctx.type === vue.unref(MarkerType).ArrowClosed ? (vue.openBlock(), vue.createElementBlock("polyline", {
            key: 0,
            style: vue.normalizeStyle({
              stroke: _ctx.color,
              fill: _ctx.color,
              strokeWidth: _ctx.strokeWidth
            }),
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            points: "-5,-4 0,0 -5,4 -5,-4"
          }, null, 4)) : vue.createCommentVNode("", true),
          _ctx.type === vue.unref(MarkerType).Arrow ? (vue.openBlock(), vue.createElementBlock("polyline", {
            key: 1,
            style: vue.normalizeStyle({
              stroke: _ctx.color,
              strokeWidth: _ctx.strokeWidth
            }),
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            fill: "none",
            points: "-5,-4 0,0 -5,4"
          }, null, 4)) : vue.createCommentVNode("", true)
        ], 8, _hoisted_1$4);
      };
    }
  });
  const __default__$5 = {
    name: "MarkerDefinitions",
    compatConfig: { MODE: 3 }
  };
  const _sfc_main$5 = /* @__PURE__ */ vue.defineComponent({
    ...__default__$5,
    setup(__props) {
      const __$temp_1 = useVueFlow(), vueFlowId = vue.toRef(__$temp_1, "id"), edges = vue.toRef(__$temp_1, "edges"), connectionLineOptions = vue.toRef(__$temp_1, "connectionLineOptions"), defaultColor = vue.toRef(__$temp_1, "defaultMarkerColor");
      const markers = vue.computed(() => {
        const ids = [];
        const markers2 = [];
        const createMarkers = (marker) => {
          if (marker) {
            const markerId = getMarkerId(marker, vueFlowId.value);
            if (!ids.includes(markerId)) {
              if (typeof marker === "object") {
                markers2.push({ ...marker, id: markerId, color: marker.color || defaultColor.value });
              } else {
                markers2.push({ id: markerId, color: defaultColor.value, type: marker });
              }
              ids.push(markerId);
            }
          }
        };
        for (const marker of [connectionLineOptions.value.markerEnd, connectionLineOptions.value.markerStart]) {
          createMarkers(marker);
        }
        edges.value.reduce((markers3, edge) => {
          for (const marker of [edge.markerStart, edge.markerEnd]) {
            createMarkers(marker);
          }
          return markers3.sort((a, b) => a.id.localeCompare(b.id));
        }, markers2);
        return markers2;
      });
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("defs", null, [
          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(markers.value, (marker) => {
            return vue.openBlock(), vue.createBlock(_sfc_main$6, {
              id: marker.id,
              key: marker.id,
              type: marker.type,
              color: marker.color,
              width: marker.width,
              height: marker.height,
              markerUnits: marker.markerUnits,
              "stroke-width": marker.strokeWidth,
              orient: marker.orient
            }, null, 8, ["id", "type", "color", "width", "height", "markerUnits", "stroke-width", "orient"]);
          }), 128))
        ]);
      };
    }
  });
  const _hoisted_1$3 = { class: "vue-flow__edges vue-flow__container" };
  const __default__$4 = {
    name: "Edges",
    compatConfig: { MODE: 3 }
  };
  const _sfc_main$4 = /* @__PURE__ */ vue.defineComponent({
    ...__default__$4,
    setup(__props) {
      const slots = vue.inject(Slots);
      const {
        edgesUpdatable,
        edgesFocusable,
        elementsSelectable,
        findNode,
        getEdges,
        getEdgeTypes,
        elevateEdgesOnSelect,
        dimensions,
        emits
      } = useVueFlow();
      const instance = vue.getCurrentInstance();
      function selectable(edgeSelectable) {
        return typeof edgeSelectable === "undefined" ? elementsSelectable.value : edgeSelectable;
      }
      function updatable(edgeUpdatable) {
        return typeof edgeUpdatable === "undefined" ? edgesUpdatable.value : edgeUpdatable;
      }
      function focusable(edgeFocusable) {
        return typeof edgeFocusable === "undefined" ? edgesFocusable.value : edgeFocusable;
      }
      function getType(type, template) {
        const name = type || "default";
        const slot = slots == null ? void 0 : slots[`edge-${name}`];
        if (slot) {
          return slot;
        }
        let edgeType = template ?? getEdgeTypes.value[name];
        if (typeof edgeType === "string") {
          if (instance) {
            const components = Object.keys(instance.appContext.components);
            if (components && components.includes(name)) {
              edgeType = vue.resolveComponent(name, false);
            }
          }
        }
        if (edgeType && typeof edgeType !== "string") {
          return edgeType;
        }
        emits.error(new VueFlowError(ErrorCode.EDGE_TYPE_MISSING, edgeType));
        return false;
      }
      return (_ctx, _cache) => {
        return vue.unref(dimensions).width && vue.unref(dimensions).height ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
          (vue.openBlock(), vue.createElementBlock("svg", _hoisted_1$3, [
            vue.createVNode(_sfc_main$5)
          ])),
          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(vue.unref(getEdges), (edge) => {
            return vue.openBlock(), vue.createElementBlock("svg", {
              key: edge.id,
              class: "vue-flow__edges vue-flow__container",
              style: vue.normalizeStyle({ zIndex: vue.unref(getEdgeZIndex)(edge, vue.unref(findNode), vue.unref(elevateEdgesOnSelect)) })
            }, [
              vue.createVNode(vue.unref(EdgeWrapper$1), {
                id: edge.id,
                edge,
                type: getType(edge.type, edge.template),
                name: edge.type || "default",
                selectable: selectable(edge.selectable),
                updatable: updatable(edge.updatable),
                focusable: focusable(edge.focusable)
              }, null, 8, ["id", "edge", "type", "name", "selectable", "updatable", "focusable"])
            ], 4);
          }), 128)),
          vue.createVNode(vue.unref(ConnectionLine$1))
        ], 64)) : vue.createCommentVNode("", true);
      };
    }
  });
  const NodeWrapper = vue.defineComponent({
    name: "Node",
    compatConfig: { MODE: 3 },
    props: ["name", "type", "id", "draggable", "selectable", "focusable", "connectable", "node", "resizeObserver"],
    setup(props) {
      vue.provide(NodeId, props.id);
      const {
        id: vueFlowId,
        noPanClassName,
        selectNodesOnDrag,
        nodesSelectionActive,
        multiSelectionActive,
        emits,
        findNode,
        removeSelectedNodes,
        addSelectedNodes,
        updateNodeDimensions,
        onUpdateNodeInternals,
        getIntersectingNodes,
        getNodeTypes,
        nodeExtent,
        elevateNodesOnSelect,
        disableKeyboardA11y,
        ariaLiveMessage,
        snapToGrid,
        snapGrid,
        nodeDragThreshold,
        getConnectedEdges: getConnectedEdges2
      } = useVueFlow();
      const updateNodePositions = useUpdateNodePositions();
      const node = useVModel(props, "node");
      const parentNode = vue.computed(() => {
        var _a;
        return findNode((_a = node.value) == null ? void 0 : _a.parentNode);
      });
      const connectedEdges = vue.computed(() => getConnectedEdges2(node.value ? [node.value] : []));
      const nodeElement = vue.ref(null);
      vue.provide(NodeRef, nodeElement);
      const { emit, on } = useNodeHooks(node.value, emits);
      const dragging = useDrag({
        id: props.id,
        el: nodeElement,
        disabled: () => !props.draggable,
        selectable: () => props.selectable,
        dragHandle: () => node.value.dragHandle,
        onStart(args) {
          emit.dragStart({ ...args, intersections: getIntersectingNodes(node.value) });
        },
        onDrag(args) {
          emit.drag({ ...args, intersections: getIntersectingNodes(node.value) });
        },
        onStop(args) {
          emit.dragStop({ ...args, intersections: getIntersectingNodes(node.value) });
        }
      });
      const getClass = vue.computed(() => node.value.class instanceof Function ? node.value.class(node.value) : node.value.class);
      const getStyle = vue.computed(() => {
        const styles = (node.value.style instanceof Function ? node.value.style(node.value) : node.value.style) || {};
        const width = node.value.width instanceof Function ? node.value.width(node.value) : node.value.width;
        const height = node.value.height instanceof Function ? node.value.height(node.value) : node.value.height;
        if (width) {
          styles.width = typeof width === "string" ? width : `${width}px`;
        }
        if (height) {
          styles.height = typeof height === "string" ? height : `${height}px`;
        }
        return styles;
      });
      const zIndex = vue.toRef(() => Number(node.value.zIndex ?? getStyle.value.zIndex ?? 0));
      onUpdateNodeInternals((updateIds) => {
        if (updateIds.includes(props.id)) {
          updateInternals();
        }
      });
      vue.onMounted(() => {
        props.resizeObserver.observe(nodeElement.value);
      });
      vue.onBeforeUnmount(() => {
        props.resizeObserver.unobserve(nodeElement.value);
      });
      vue.watch([() => node.value.type, () => node.value.sourcePosition, () => node.value.targetPosition], () => {
        vue.nextTick(() => {
          updateNodeDimensions([{ id: props.id, nodeElement: nodeElement.value, forceUpdate: true }]);
        });
      });
      vue.watch(
        [
          () => node.value.position.x,
          () => node.value.position.y,
          () => {
            var _a;
            return (_a = parentNode.value) == null ? void 0 : _a.computedPosition.x;
          },
          () => {
            var _a;
            return (_a = parentNode.value) == null ? void 0 : _a.computedPosition.y;
          },
          () => {
            var _a;
            return (_a = parentNode.value) == null ? void 0 : _a.computedPosition.z;
          },
          zIndex,
          () => node.value.selected,
          () => node.value.dimensions.height,
          () => node.value.dimensions.width,
          () => {
            var _a;
            return (_a = parentNode.value) == null ? void 0 : _a.dimensions.height;
          },
          () => {
            var _a;
            return (_a = parentNode.value) == null ? void 0 : _a.dimensions.width;
          }
        ],
        ([newX, newY, parentX, parentY, parentZ, nodeZIndex]) => {
          const xyzPos = {
            x: newX,
            y: newY,
            z: nodeZIndex + (elevateNodesOnSelect.value ? node.value.selected ? 1e3 : 0 : 0)
          };
          if (typeof parentX !== "undefined" && typeof parentY !== "undefined") {
            node.value.computedPosition = getXYZPos({ x: parentX, y: parentY, z: parentZ }, xyzPos);
          } else {
            node.value.computedPosition = xyzPos;
          }
        },
        { flush: "post", immediate: true }
      );
      vue.watch([() => node.value.extent, nodeExtent], ([nodeExtent2, globalExtent], [oldNodeExtent, oldGlobalExtent]) => {
        if (nodeExtent2 !== oldNodeExtent || globalExtent !== oldGlobalExtent) {
          clampPosition2();
        }
      });
      if (node.value.extent === "parent" || typeof node.value.extent === "object" && "range" in node.value.extent && node.value.extent.range === "parent") {
        until(() => node.value.initialized).toBe(true).then(clampPosition2);
      } else {
        clampPosition2();
      }
      return () => vue.h(
        "div",
        {
          "ref": nodeElement,
          "data-id": node.value.id,
          "class": [
            "vue-flow__node",
            `vue-flow__node-${props.type === false ? "default" : props.name}`,
            {
              [noPanClassName.value]: props.draggable,
              dragging: dragging == null ? void 0 : dragging.value,
              draggable: props.draggable,
              selected: node.value.selected,
              selectable: props.selectable,
              parent: node.value.isParent
            },
            getClass.value
          ],
          "style": {
            visibility: node.value.initialized ? "visible" : "hidden",
            zIndex: node.value.computedPosition.z ?? zIndex.value,
            transform: `translate(${node.value.computedPosition.x}px,${node.value.computedPosition.y}px)`,
            pointerEvents: props.selectable || props.draggable ? "all" : "none",
            ...getStyle.value
          },
          "tabIndex": props.focusable ? 0 : void 0,
          "role": props.focusable ? "button" : void 0,
          "aria-describedby": disableKeyboardA11y.value ? void 0 : `${ARIA_NODE_DESC_KEY}-${vueFlowId}`,
          "aria-label": node.value.ariaLabel,
          "onMouseenter": onMouseEnter,
          "onMousemove": onMouseMove,
          "onMouseleave": onMouseLeave,
          "onContextmenu": onContextMenu,
          "onClick": onSelectNode,
          "onDblclick": onDoubleClick,
          "onKeydown": onKeyDown
        },
        [
          vue.h(props.type === false ? getNodeTypes.value.default : props.type, {
            id: node.value.id,
            type: node.value.type,
            data: node.value.data,
            events: { ...node.value.events, ...on },
            selected: node.value.selected,
            resizing: node.value.resizing,
            dragging: dragging.value,
            connectable: props.connectable,
            position: node.value.computedPosition,
            dimensions: node.value.dimensions,
            isValidTargetPos: node.value.isValidTargetPos,
            isValidSourcePos: node.value.isValidSourcePos,
            parent: node.value.parentNode,
            parentNodeId: node.value.parentNode,
            zIndex: node.value.computedPosition.z ?? zIndex.value,
            targetPosition: node.value.targetPosition,
            sourcePosition: node.value.sourcePosition,
            label: node.value.label,
            dragHandle: node.value.dragHandle,
            onUpdateNodeInternals: updateInternals
          })
        ]
      );
      function clampPosition2() {
        const nextPos = node.value.computedPosition;
        if (snapToGrid.value) {
          nextPos.x = snapGrid.value[0] * Math.round(nextPos.x / snapGrid.value[0]);
          nextPos.y = snapGrid.value[1] * Math.round(nextPos.y / snapGrid.value[1]);
        }
        const { computedPosition, position } = calcNextPosition(
          node.value,
          nextPos,
          emits.error,
          nodeExtent.value,
          parentNode.value
        );
        if (node.value.computedPosition.x !== computedPosition.x || node.value.computedPosition.y !== computedPosition.y) {
          node.value.computedPosition = { ...node.value.computedPosition, ...computedPosition };
        }
        if (node.value.position.x !== position.x || node.value.position.y !== position.y) {
          node.value.position = position;
        }
      }
      function updateInternals() {
        if (nodeElement.value) {
          updateNodeDimensions([{ id: props.id, nodeElement: nodeElement.value, forceUpdate: true }]);
        }
      }
      function onMouseEnter(event) {
        if (!(dragging == null ? void 0 : dragging.value)) {
          emit.mouseEnter({ event, node: node.value, connectedEdges: connectedEdges.value });
        }
      }
      function onMouseMove(event) {
        if (!(dragging == null ? void 0 : dragging.value)) {
          emit.mouseMove({ event, node: node.value, connectedEdges: connectedEdges.value });
        }
      }
      function onMouseLeave(event) {
        if (!(dragging == null ? void 0 : dragging.value)) {
          emit.mouseLeave({ event, node: node.value, connectedEdges: connectedEdges.value });
        }
      }
      function onContextMenu(event) {
        return emit.contextMenu({ event, node: node.value, connectedEdges: connectedEdges.value });
      }
      function onDoubleClick(event) {
        return emit.doubleClick({ event, node: node.value, connectedEdges: connectedEdges.value });
      }
      function onSelectNode(event) {
        if (props.selectable && (!selectNodesOnDrag.value || !props.draggable || nodeDragThreshold.value > 0)) {
          handleNodeClick(
            node.value,
            multiSelectionActive.value,
            addSelectedNodes,
            removeSelectedNodes,
            nodesSelectionActive,
            false,
            nodeElement.value
          );
        }
        emit.click({ event, node: node.value, connectedEdges: connectedEdges.value });
      }
      function onKeyDown(event) {
        if (isInputDOMNode(event) || disableKeyboardA11y.value) {
          return;
        }
        if (elementSelectionKeys.includes(event.key) && props.selectable) {
          const unselect = event.key === "Escape";
          handleNodeClick(
            node.value,
            multiSelectionActive.value,
            addSelectedNodes,
            removeSelectedNodes,
            nodesSelectionActive,
            unselect,
            nodeElement.value
          );
        } else if (props.draggable && node.value.selected && arrowKeyDiffs[event.key]) {
          ariaLiveMessage.value = `Moved selected node ${event.key.replace("Arrow", "").toLowerCase()}. New position, x: ${~~node.value.position.x}, y: ${~~node.value.position.y}`;
          updateNodePositions(
            {
              x: arrowKeyDiffs[event.key].x,
              y: arrowKeyDiffs[event.key].y
            },
            event.shiftKey
          );
        }
      }
    }
  });
  const NodeWrapper$1 = NodeWrapper;
  const _hoisted_1$2 = {
    height: "0",
    width: "0"
  };
  const __default__$3 = {
    name: "EdgeLabelRenderer",
    compatConfig: { MODE: 3 }
  };
  const _sfc_main$3 = /* @__PURE__ */ vue.defineComponent({
    ...__default__$3,
    setup(__props) {
      const { viewportRef } = useVueFlow();
      const teleportTarget = vue.toRef(() => {
        var _a;
        return (_a = viewportRef.value) == null ? void 0 : _a.getElementsByClassName("vue-flow__edge-labels")[0];
      });
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("svg", null, [
          (vue.openBlock(), vue.createElementBlock("foreignObject", _hoisted_1$2, [
            (vue.openBlock(), vue.createBlock(vue.Teleport, {
              to: teleportTarget.value,
              disabled: !teleportTarget.value
            }, [
              vue.renderSlot(_ctx.$slots, "default")
            ], 8, ["to", "disabled"]))
          ]))
        ]);
      };
    }
  });
  function useNodesInitialized(options = { includeHiddenNodes: false }) {
    const { nodes } = useVueFlow();
    return vue.computed(() => {
      if (nodes.value.length === 0) {
        return false;
      }
      for (const node of nodes.value) {
        if (options.includeHiddenNodes || !node.hidden) {
          if ((node == null ? void 0 : node.handleBounds) === void 0) {
            return false;
          }
        }
      }
      return true;
    });
  }
  const _hoisted_1$1 = { class: "vue-flow__nodes vue-flow__container" };
  const __default__$2 = {
    name: "Nodes",
    compatConfig: { MODE: 3 }
  };
  const _sfc_main$2 = /* @__PURE__ */ vue.defineComponent({
    ...__default__$2,
    setup(__props) {
      const {
        nodes,
        nodesDraggable,
        nodesFocusable,
        elementsSelectable,
        nodesConnectable,
        getNodes,
        getNodeTypes,
        updateNodeDimensions,
        emits
      } = useVueFlow();
      const nodesInitialized = useNodesInitialized();
      const slots = vue.inject(Slots);
      const resizeObserver = vue.ref();
      const instance = vue.getCurrentInstance();
      vue.watch(
        nodesInitialized,
        (initialized) => {
          if (initialized) {
            vue.nextTick(() => {
              emits.nodesInitialized(nodes.value);
            });
          }
        },
        { immediate: true }
      );
      vue.onMounted(() => {
        resizeObserver.value = new ResizeObserver((entries) => {
          const updates = entries.map((entry) => {
            const id2 = entry.target.getAttribute("data-id");
            return {
              id: id2,
              nodeElement: entry.target,
              forceUpdate: true
            };
          });
          vue.nextTick(() => updateNodeDimensions(updates));
        });
      });
      vue.onBeforeUnmount(() => {
        var _a;
        return (_a = resizeObserver.value) == null ? void 0 : _a.disconnect();
      });
      function draggable(nodeDraggable) {
        return typeof nodeDraggable === "undefined" ? nodesDraggable.value : nodeDraggable;
      }
      function selectable(nodeSelectable) {
        return typeof nodeSelectable === "undefined" ? elementsSelectable.value : nodeSelectable;
      }
      function connectable(nodeConnectable) {
        return typeof nodeConnectable === "undefined" ? nodesConnectable.value : nodeConnectable;
      }
      function focusable(nodeFocusable) {
        return typeof nodeFocusable === "undefined" ? nodesFocusable.value : nodeFocusable;
      }
      function getType(type, template) {
        const name = type || "default";
        const slot = slots == null ? void 0 : slots[`node-${name}`];
        if (slot) {
          return slot;
        }
        let nodeType = template ?? getNodeTypes.value[name];
        if (typeof nodeType === "string") {
          if (instance) {
            const components = Object.keys(instance.appContext.components);
            if (components && components.includes(name)) {
              nodeType = vue.resolveComponent(name, false);
            }
          }
        }
        if (nodeType && typeof nodeType !== "string") {
          return nodeType;
        }
        emits.error(new VueFlowError(ErrorCode.NODE_TYPE_MISSING, nodeType));
        return false;
      }
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$1, [
          resizeObserver.value ? (vue.openBlock(true), vue.createElementBlock(vue.Fragment, { key: 0 }, vue.renderList(vue.unref(getNodes), (node) => {
            return vue.openBlock(), vue.createBlock(vue.unref(NodeWrapper$1), {
              id: node.id,
              key: node.id,
              "resize-observer": resizeObserver.value,
              type: getType(node.type, node.template),
              name: node.type || "default",
              draggable: draggable(node.draggable),
              selectable: selectable(node.selectable),
              connectable: connectable(node.connectable),
              focusable: focusable(node.focusable),
              node
            }, null, 8, ["id", "resize-observer", "type", "name", "draggable", "selectable", "connectable", "focusable", "node"]);
          }), 128)) : vue.createCommentVNode("", true)
        ]);
      };
    }
  });
  const _hoisted_1 = /* @__PURE__ */ vue.createElementVNode("div", { class: "vue-flow__edge-labels" }, null, -1);
  const __default__$1 = {
    name: "VueFlow",
    compatConfig: { MODE: 3 }
  };
  const _sfc_main$1 = /* @__PURE__ */ vue.defineComponent({
    ...__default__$1,
    props: {
      id: {},
      modelValue: {},
      nodes: {},
      edges: {},
      edgeTypes: {},
      nodeTypes: {},
      connectionMode: {},
      connectionLineType: {},
      connectionLineStyle: { default: void 0 },
      connectionLineOptions: { default: void 0 },
      connectionRadius: {},
      isValidConnection: { type: [Function, null], default: void 0 },
      deleteKeyCode: { default: void 0 },
      selectionKeyCode: { default: void 0 },
      multiSelectionKeyCode: { default: void 0 },
      zoomActivationKeyCode: { default: void 0 },
      panActivationKeyCode: { default: void 0 },
      snapToGrid: { type: Boolean, default: void 0 },
      snapGrid: {},
      onlyRenderVisibleElements: { type: Boolean, default: void 0 },
      edgesUpdatable: { type: [Boolean, String], default: void 0 },
      nodesDraggable: { type: Boolean, default: void 0 },
      nodesConnectable: { type: Boolean, default: void 0 },
      nodeDragThreshold: {},
      elementsSelectable: { type: Boolean, default: void 0 },
      selectNodesOnDrag: { type: Boolean, default: void 0 },
      panOnDrag: { type: [Boolean, Array], default: void 0 },
      minZoom: {},
      maxZoom: {},
      defaultViewport: {},
      translateExtent: {},
      nodeExtent: {},
      defaultMarkerColor: {},
      zoomOnScroll: { type: Boolean, default: void 0 },
      zoomOnPinch: { type: Boolean, default: void 0 },
      panOnScroll: { type: Boolean, default: void 0 },
      panOnScrollSpeed: {},
      panOnScrollMode: {},
      zoomOnDoubleClick: { type: Boolean, default: void 0 },
      preventScrolling: { type: Boolean, default: void 0 },
      selectionMode: {},
      edgeUpdaterRadius: {},
      fitViewOnInit: { type: Boolean, default: void 0 },
      connectOnClick: { type: Boolean, default: void 0 },
      applyDefault: { type: Boolean, default: void 0 },
      autoConnect: { type: [Boolean, Function], default: void 0 },
      noDragClassName: {},
      noWheelClassName: {},
      noPanClassName: {},
      defaultEdgeOptions: {},
      elevateEdgesOnSelect: { type: Boolean, default: void 0 },
      elevateNodesOnSelect: { type: Boolean, default: void 0 },
      disableKeyboardA11y: { type: Boolean, default: void 0 },
      edgesFocusable: { type: Boolean, default: void 0 },
      nodesFocusable: { type: Boolean, default: void 0 },
      autoPanOnConnect: { type: Boolean, default: void 0 },
      autoPanOnNodeDrag: { type: Boolean, default: void 0 }
    },
    emits: ["nodesChange", "edgesChange", "nodeDoubleClick", "nodeClick", "nodeMouseEnter", "nodeMouseMove", "nodeMouseLeave", "nodeContextMenu", "nodeDragStart", "nodeDrag", "nodeDragStop", "nodesInitialized", "miniMapNodeClick", "miniMapNodeDoubleClick", "miniMapNodeMouseEnter", "miniMapNodeMouseMove", "miniMapNodeMouseLeave", "connect", "connectStart", "connectEnd", "clickConnectStart", "clickConnectEnd", "moveStart", "move", "moveEnd", "selectionDragStart", "selectionDrag", "selectionDragStop", "selectionContextMenu", "selectionStart", "selectionEnd", "viewportChangeStart", "viewportChange", "viewportChangeEnd", "paneReady", "init", "paneScroll", "paneClick", "paneContextMenu", "paneMouseEnter", "paneMouseMove", "paneMouseLeave", "edgeContextMenu", "edgeMouseEnter", "edgeMouseMove", "edgeMouseLeave", "edgeDoubleClick", "edgeClick", "edgeUpdateStart", "edgeUpdate", "edgeUpdateEnd", "updateNodeInternals", "error", "update:modelValue", "update:nodes", "update:edges"],
    setup(__props, { expose: __expose, emit }) {
      const props = __props;
      const slots = vue.useSlots();
      const modelValue = useVModel(props, "modelValue", emit);
      const modelNodes = useVModel(props, "nodes", emit);
      const modelEdges = useVModel(props, "edges", emit);
      const { vueFlowRef, hooks, getNodeTypes, getEdgeTypes, ...rest } = useVueFlow(props);
      const dispose = useWatchProps({ modelValue, nodes: modelNodes, edges: modelEdges }, props, {
        vueFlowRef,
        hooks,
        getNodeTypes,
        getEdgeTypes,
        ...rest
      });
      useHooks(emit, hooks);
      useOnInitHandler();
      vue.provide(Slots, slots);
      vue.onUnmounted(() => {
        dispose();
      });
      __expose({
        vueFlowRef,
        hooks,
        getNodeTypes,
        getEdgeTypes,
        ...rest
      });
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", {
          ref_key: "vueFlowRef",
          ref: vueFlowRef,
          class: "vue-flow"
        }, [
          vue.createVNode(_sfc_main$8, null, {
            default: vue.withCtx(() => [
              vue.createVNode(_sfc_main$4),
              _hoisted_1,
              vue.createVNode(_sfc_main$2),
              vue.renderSlot(_ctx.$slots, "zoom-pane")
            ]),
            _: 3
          }),
          vue.renderSlot(_ctx.$slots, "default"),
          vue.createVNode(_sfc_main$7)
        ], 512);
      };
    }
  });
  const __default__ = {
    name: "Panel",
    compatConfig: { MODE: 3 }
  };
  const _sfc_main = /* @__PURE__ */ vue.defineComponent({
    ...__default__,
    props: {
      position: {}
    },
    setup(__props) {
      const props = __props;
      const { userSelectionActive } = useVueFlow();
      const positionClasses = vue.computed(() => `${props.position}`.split("-"));
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", {
          class: vue.normalizeClass(["vue-flow__panel", positionClasses.value]),
          style: vue.normalizeStyle({ pointerEvents: vue.unref(userSelectionActive) ? "none" : "all" })
        }, [
          vue.renderSlot(_ctx.$slots, "default")
        ], 6);
      };
    }
  });
  function useConnection() {
    const {
      connectionStartHandle: startHandle,
      connectionEndHandle: endHandle,
      connectionStatus: status,
      connectionPosition: position
    } = useVueFlow();
    return {
      startHandle,
      endHandle,
      status,
      position
    };
  }
  function useHandleConnections(params) {
    const { type, id: id2, nodeId, onConnect, onDisconnect } = params;
    const { connectionLookup } = useVueFlow();
    const _nodeId = useNodeId();
    const currentNodeId = vue.toRef(() => vue.toValue(nodeId) ?? _nodeId);
    const handleType = vue.toRef(() => vue.toValue(type));
    const handleId = vue.toRef(() => vue.toValue(id2) ?? null);
    const connections = vue.ref();
    vue.watch(
      () => connectionLookup.value.get(`${currentNodeId.value}-${handleType.value}-${handleId.value}`),
      (nextConnections) => {
        if (areConnectionMapsEqual(connections.value, nextConnections)) {
          return;
        }
        connections.value = nextConnections;
      },
      { immediate: true }
    );
    vue.watch(
      [connections, () => typeof onConnect !== "undefined", () => typeof onDisconnect !== "undefined"],
      ([currentConnections], [prevConnections]) => {
        if (prevConnections && prevConnections !== currentConnections) {
          const _connections = currentConnections ?? /* @__PURE__ */ new Map();
          handleConnectionChange(prevConnections, _connections, onDisconnect);
          handleConnectionChange(_connections, prevConnections, onConnect);
        }
      },
      { immediate: true }
    );
    return vue.computed(() => {
      var _a;
      return Array.from(((_a = connections.value) == null ? void 0 : _a.values()) ?? []);
    });
  }
  function useNodesData(_nodeIds) {
    const { findNode } = useVueFlow();
    return vue.computed({
      get() {
        const nodeIds = vue.toValue(_nodeIds);
        if (!Array.isArray(nodeIds)) {
          const node = findNode(nodeIds);
          if (node) {
            return {
              id: node.id,
              type: node.type,
              data: node.data ?? null
            };
          }
          return null;
        }
        const data = [];
        for (const nodeId of nodeIds) {
          const node = findNode(nodeId);
          if (node) {
            data.push({
              id: node.id,
              type: node.type,
              data: node.data ?? null
            });
          }
        }
        return data;
      },
      set() {
        warn("You are trying to set node data via useNodesData. This is not supported.");
      }
    });
  }
  exports.BaseEdge = _sfc_main$d;
  exports.BezierEdge = BezierEdge$1;
  exports.ConnectionLineType = ConnectionLineType;
  exports.ConnectionMode = ConnectionMode;
  exports.EdgeLabelRenderer = _sfc_main$3;
  exports.EdgeText = _sfc_main$e;
  exports.ErrorCode = ErrorCode;
  exports.Handle = _sfc_main$f;
  exports.MarkerType = MarkerType;
  exports.NodeIdInjection = NodeId;
  exports.PanOnScrollMode = PanOnScrollMode;
  exports.Panel = _sfc_main;
  exports.PanelPosition = PanelPosition;
  exports.Position = Position;
  exports.SelectionMode = SelectionMode;
  exports.SimpleBezierEdge = SimpleBezierEdge$1;
  exports.SmoothStepEdge = SmoothStepEdge$1;
  exports.StepEdge = StepEdge$1;
  exports.StraightEdge = StraightEdge$1;
  exports.VueFlow = _sfc_main$1;
  exports.VueFlowError = VueFlowError;
  exports.VueFlowInjection = VueFlow;
  exports.addEdge = addEdge;
  exports.applyChanges = applyChanges;
  exports.applyEdgeChanges = applyEdgeChanges;
  exports.applyNodeChanges = applyNodeChanges;
  exports.clamp = clamp;
  exports.connectionExists = connectionExists;
  exports.defaultEdgeTypes = defaultEdgeTypes;
  exports.defaultNodeTypes = defaultNodeTypes;
  exports.getBezierEdgeCenter = getBezierEdgeCenter;
  exports.getBezierPath = getBezierPath;
  exports.getBoundsofRects = getBoundsofRects;
  exports.getConnectedEdges = getConnectedEdges;
  exports.getIncomers = getIncomers;
  exports.getMarkerId = getMarkerId;
  exports.getNodesInside = getNodesInside;
  exports.getOutgoers = getOutgoers;
  exports.getRectOfNodes = getRectOfNodes;
  exports.getSimpleBezierPath = getSimpleBezierPath;
  exports.getSimpleEdgeCenter = getSimpleEdgeCenter;
  exports.getSmoothStepPath = getSmoothStepPath;
  exports.getStraightPath = getStraightPath;
  exports.getTransformForBounds = getTransformForBounds;
  exports.graphPosToZoomedPos = rendererPointToPoint;
  exports.isEdge = isEdge;
  exports.isErrorOfType = isErrorOfType;
  exports.isGraphEdge = isGraphEdge;
  exports.isGraphNode = isGraphNode;
  exports.isNode = isNode;
  exports.pointToRendererPoint = pointToRendererPoint;
  exports.rendererPointToPoint = rendererPointToPoint;
  exports.updateEdge = updateEdge;
  exports.useConnection = useConnection;
  exports.useEdge = useEdge;
  exports.useGetPointerPosition = useGetPointerPosition;
  exports.useHandle = useHandle;
  exports.useHandleConnections = useHandleConnections;
  exports.useNode = useNode;
  exports.useNodeId = useNodeId;
  exports.useNodesData = useNodesData;
  exports.useNodesInitialized = useNodesInitialized;
  exports.useVueFlow = useVueFlow;
  exports.useZoomPanHelper = useZoomPanHelper;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
}({}, Vue);
