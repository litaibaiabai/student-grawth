export function createCaptureLease(milliseconds, onTimeout) {
  let closed = false,
    stream = null,
    model = null;
  const stop = (s) => s?.getTracks().forEach((t) => t.stop());
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    stop(stream);
    model?.close();
    stream = null;
    model = null;
  }
  const timer = setTimeout(
    () => {
      close();
      onTimeout();
    },
    Math.max(1, milliseconds),
  );
  return {
    useStream(value) {
      if (closed) {
        stop(value);
        return false;
      }
      if (stream !== value) stop(stream);
      stream = value;
      return true;
    },
    useModel(value) {
      if (closed) {
        value.close();
        return false;
      }
      if (model !== value) model?.close();
      model = value;
      return true;
    },
    close,
  };
}
