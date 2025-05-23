import {get as getBrowserGlobals} from 'app/client/lib/browserGlobals';
import {setupLocale} from 'app/client/lib/localization';
import {AppModel, TopAppModelImpl, TopAppModelOptions} from 'app/client/models/AppModel';
import {reportError, setUpErrorHandling} from 'app/client/models/errors';
import {buildSnackbarDom} from 'app/client/ui/NotifyUI';
import {addViewportTag} from 'app/client/ui/viewport';
import {attachCssRootVars} from 'app/client/ui2018/cssVars';
import {attachTheme} from 'app/client/ui2018/theme';
import {BaseAPI} from 'app/common/BaseAPI';
import {dom, DomContents} from 'grainjs';

const G = getBrowserGlobals('document', 'window');

/**
 * Sets up the application model, error handling, and global styles, and replaces
 * the DOM body with the result of calling `buildAppPage`.
 */
export function createAppPage(
  buildAppPage: (appModel: AppModel) => DomContents,
  modelOptions: TopAppModelOptions = {}
) {
  setUpErrorHandling();

  const topAppModel = TopAppModelImpl.create(null, {}, undefined, modelOptions);

  addViewportTag();
  attachCssRootVars(topAppModel.productFlavor);
  attachTheme();
  setupLocale().catch(reportError);

  // Add globals needed by test utils.
  G.window.gristApp = {
    topAppModel,
    testNumPendingApiRequests: () => BaseAPI.numPendingRequests(),
  };
  dom.update(document.body, dom.maybe(topAppModel.appObs, (appModel) => {
    return [
      buildAppPage(appModel),
      buildSnackbarDom(appModel.notifier, appModel),
    ];
  }));
}
