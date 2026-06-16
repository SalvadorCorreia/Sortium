/// <reference types="react" />

import * as React from 'react';

declare global {
	namespace JSX {
		interface IntrinsicElements extends React.JSX.IntrinsicElements {
			[elemName: string]: any;
		}
	}
	var MainWindowBrowserManager: any;
	var collectionStore: any;
	var uiStore: any;
}
