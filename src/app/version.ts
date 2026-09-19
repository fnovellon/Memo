export const APP_VERSION = __APP_VERSION__;
export const APP_COMMIT = __APP_COMMIT__;

/** « 0.2.0 · a1b2c3d », ou la seule version hors d'un dépôt git. */
export const APP_BUILD = APP_COMMIT ? `${APP_VERSION} · ${APP_COMMIT}` : APP_VERSION;
