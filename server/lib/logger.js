function ts() {
  return new Date().toISOString();
}

function info(msg, extra) {
  if (typeof extra === "undefined") {
    console.log(`[${ts()}] INFO ${msg}`);
    return;
  }
  console.log(`[${ts()}] INFO ${msg}`, extra);
}

function error(msg, extra) {
  if (typeof extra === "undefined") {
    console.error(`[${ts()}] ERROR ${msg}`);
    return;
  }
  console.error(`[${ts()}] ERROR ${msg}`, extra);
}

module.exports = { info, error };
