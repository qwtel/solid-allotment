let _isIOS = false;
let _isMacintosh = false;
let _isWebkit = false;
let _userAgent: string | undefined = undefined;

interface INavigator {
  maxTouchPoints?: number;
  userAgent: string;
}

declare const navigator: INavigator;

// Web environment
if (typeof navigator === "object") {
  _userAgent = navigator.userAgent;
  _isMacintosh = _userAgent.indexOf("Macintosh") >= 0;
  _isIOS =
    (_userAgent.indexOf("Macintosh") >= 0 ||
      _userAgent.indexOf("iPad") >= 0 ||
      _userAgent.indexOf("iPhone") >= 0) &&
    !!navigator.maxTouchPoints &&
    navigator.maxTouchPoints > 0;
  _isWebkit = _userAgent.indexOf("WebKit") >= 0 && _userAgent.indexOf("Chrome") < 0;
}

export const isIOS = _isIOS;
export const isMacintosh = _isMacintosh;
export const isApple = _isIOS || _isMacintosh
export const isWebkit = _isWebkit;
