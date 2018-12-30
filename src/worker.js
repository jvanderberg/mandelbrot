import 'babel-polyfill';

import { getIterations } from './common.js';

self.addEventListener('message', function (event) {
	const results = getIterations(event.data);
	postMessage(results);
});
