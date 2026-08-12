/** Product screenshots — PNG fallback + sized WebP for the MacBook hero. */
import dashboardPreviewUrl from './dashboard-preview.png';
import dashboardPreviewDarkUrl from './dashboard-preview-dark.png';
import dashboardPreview1200 from './dashboard-preview-1200.webp';
import dashboardPreview2400 from './dashboard-preview-2400.webp';
import dashboardPreviewDark1200 from './dashboard-preview-dark-1200.webp';
import dashboardPreviewDark2400 from './dashboard-preview-dark-2400.webp';

export const dashboardPreview = dashboardPreviewUrl;
export const dashboardPreviewDark = dashboardPreviewDarkUrl;
export const dashboardPreviewWebpSrcSet = `${dashboardPreview1200} 1200w, ${dashboardPreview2400} 2400w`;
export const dashboardPreviewDarkWebpSrcSet = `${dashboardPreviewDark1200} 1200w, ${dashboardPreviewDark2400} 2400w`;
export const DASHBOARD_PREVIEW_SIZES = '(max-width: 900px) 94vw, 1100px';
export const DASHBOARD_PREVIEW_WIDTH = 2400;
/** Light asset is 1205; dark source crop is ~1204 — keep shared ratio for layout. */
export const DASHBOARD_PREVIEW_HEIGHT = 1205;
