export function log(message, data = null) {
  console.log(`${message}`, data || "");
}

export function error(message, err = null) {
  console.error(`${message}`, err || "");
}
