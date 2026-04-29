const DISPLAYED_ERROR_FLAG = 'repairErrorDisplayed';

type DisplayedError = Error & {
  [DISPLAYED_ERROR_FLAG]?: boolean;
};

export function markErrorAsDisplayed(error: Error): void {
  (error as DisplayedError)[DISPLAYED_ERROR_FLAG] = true;
}

export function wasErrorDisplayed(error: Error): boolean {
  return (error as DisplayedError)[DISPLAYED_ERROR_FLAG] === true;
}