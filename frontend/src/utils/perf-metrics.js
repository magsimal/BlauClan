(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.PerfMetrics = factory();
  }
})(this, function () {
  const MAX_EVENTS = 80;
  const events = [];
  const counters = {};
  const samples = {};
  const subscribers = new Set();

  function now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  function cloneMeta(meta) {
    if (!meta || typeof meta !== 'object') return {};
    return { ...meta };
  }

  function mergeMeta(base, extra) {
    return { ...cloneMeta(base), ...cloneMeta(extra) };
  }

  function notify(event) {
    subscribers.forEach((fn) => {
      try {
        fn(event, getSnapshot());
      } catch (e) {
        // ignore subscriber errors to avoid breaking instrumentation
      }
    });
  }

  function pushEvent(event) {
    events.push(event);
    if (events.length > MAX_EVENTS) events.shift();
    notify(event);
    return event;
  }

  function startTimer(name, meta) {
    if (!name) return null;
    return {
      name,
      meta: cloneMeta(meta),
      start: now(),
    };
  }

  function recordTiming(name, duration, meta) {
    if (!name || !Number.isFinite(duration)) return null;
    const event = {
      type: 'timing',
      name,
      duration,
      meta: cloneMeta(meta),
      timestamp: Date.now(),
    };
    pushEvent(event);
    recordSample(`${name}.duration`, duration);
    return event;
  }

  function endTimer(timer, meta) {
    if (!timer || typeof timer.start !== 'number') return null;
    const duration = now() - timer.start;
    return recordTiming(timer.name, duration, mergeMeta(timer.meta, meta));
  }

  function recordEvent(name, meta) {
    if (!name) return null;
    const event = {
      type: 'event',
      name,
      meta: cloneMeta(meta),
      timestamp: Date.now(),
    };
    return pushEvent(event);
  }

  function incrementCounter(name, value) {
    if (!name) return null;
    const delta = Number.isFinite(value) ? value : 1;
    counters[name] = (counters[name] || 0) + delta;
    return counters[name];
  }

  function recordSample(name, value) {
    if (!name || !Number.isFinite(value)) return null;
    const sample = samples[name] || {
      count: 0,
      total: 0,
      min: value,
      max: value,
      avg: value,
    };
    sample.count += 1;
    sample.total += value;
    sample.min = Math.min(sample.min, value);
    sample.max = Math.max(sample.max, value);
    sample.avg = sample.total / sample.count;
    samples[name] = sample;
    return sample;
  }

  function getSnapshot() {
    return {
      events: events.slice(),
      counters: { ...counters },
      samples: JSON.parse(JSON.stringify(samples)),
    };
  }

  function reset() {
    events.length = 0;
    Object.keys(counters).forEach((key) => {
      delete counters[key];
    });
    Object.keys(samples).forEach((key) => {
      delete samples[key];
    });
  }

  function subscribe(handler) {
    if (typeof handler !== 'function') {
      return function unsubscribe() {};
    }
    subscribers.add(handler);
    return function unsubscribe() {
      subscribers.delete(handler);
    };
  }

  async function timeAsync(name, meta, fn) {
    if (typeof fn !== 'function') return undefined;
    const timer = startTimer(name, meta);
    try {
      const result = await fn();
      endTimer(timer);
      return result;
    } catch (err) {
      endTimer(timer, { error: true });
      throw err;
    }
  }

  function timeSync(name, meta, fn) {
    if (typeof fn !== 'function') return undefined;
    const timer = startTimer(name, meta);
    try {
      const result = fn();
      endTimer(timer);
      return result;
    } catch (err) {
      endTimer(timer, { error: true });
      throw err;
    }
  }

  return {
    startTimer,
    endTimer,
    recordTiming,
    recordEvent,
    incrementCounter,
    recordSample,
    getSnapshot,
    reset,
    subscribe,
    timeAsync,
    timeSync,
  };
});
