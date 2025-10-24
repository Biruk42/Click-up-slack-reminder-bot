export function log(message, data = null) {
  console.log(`Info: ${message}`, data || "");
}

export function error(message, err = null) {
  console.error(`Error: ${message}`, err || "");
}
