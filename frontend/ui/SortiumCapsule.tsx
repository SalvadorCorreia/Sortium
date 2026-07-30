import { findModule, Navigation } from '@steambrew/client';

declare global {
	var appStore: any;
}

interface SortiumCapsuleProps {
	appId: number;
	metricText?: string;
}

export function SortiumCapsule({ appId, metricText = 'No data' }: SortiumCapsuleProps) {
	const glowModule = findModule((m) => m.LibraryImageBackgroundGlow) || {};
	const layoutModule = findModule((m) => m.CapsuleVisible) || {};
	const dragModule = findModule((m) => m.GhostContainer) || {};
	const imageModule = findModule((m) => m.GreyBackground) || {};

	const app = appStore.m_mapApps.get(appId);
	const title = app?.display_name || `Unknown Game (${appId})`;

	let imageSrc = `/assets/${appId}/library_600x900.jpg`;

	if (app) {
		if (typeof app.GetLibraryCapsuleURL === 'function') {
			imageSrc = app.GetLibraryCapsuleURL();
		} else {
			const filename = app.m_strLibraryCapsuleFilename || app.library_capsule_filename;
			if (filename) {
				imageSrc = `/assets/${appId}/${filename}`;
			}
		}
	}

	const handleClick = () => {
		Navigation.Navigate(`/library/app/${appId}`);
	};

	return (
		<div
			className={`${layoutModule.Draggable} ${layoutModule.HoversEnabled} ${dragModule.Draggable}`}
			draggable="false"
			onClick={handleClick}
			style={{ cursor: 'pointer' }}
		>
			<div role="link" className={`${layoutModule.LibraryItemBox} ${layoutModule.Portrait} ${layoutModule.InCollection} Panel`} tabIndex={0}>
				<div
					className={`${imageModule.Container} ${imageModule.GreyBackground} ${imageModule.PortraitImage} ${layoutModule.PortraitImage} ${layoutModule.Capsule} ${layoutModule.CapsuleVisible}`}
				>
					<img className={`${imageModule.Image} ${imageModule.Visibility} ${imageModule.Visible}`} src={imageSrc} alt={title} />
				</div>

				<div className={`${layoutModule.LibraryItemBoxShine} ${layoutModule.Portrait}`}></div>
			</div>

			<div style={{ display: 'none' }}>{title}</div>

			<div className={layoutModule.LibraryItemBoxSubscript}>{metricText}</div>

			<div className={`${imageModule.Container} ${imageModule.GreyBackground} ${imageModule.PortraitImage} ${glowModule.LibraryImageBackgroundGlow}`}>
				<img role="presentation" className={`${imageModule.Image} ${imageModule.Visibility} ${imageModule.Visible}`} src={imageSrc} alt="" />
			</div>
		</div>
	);
}
