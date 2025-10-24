export function log(message, data = null) {
  console.log(`Info ${new Date().toISOString()}: ${message}`, data || "");
}

export function error(message, err = null) {
  console.error(`Error ${new Date().toISOString()}: ${message}`, err || "");
}
