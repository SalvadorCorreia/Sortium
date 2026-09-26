import { findModule, Navigation } from '@steambrew/client';
import { triggerCapsuleMenu } from './SortiumContextMenu';
import { useState } from 'react';

declare global {
	var appStore: any;
}

interface SortiumCapsuleProps {
	appId: number;
	metricText?: string;
	title: string;
	imageSrcs: string[];
}

export function SortiumCapsule({ appId, metricText = 'No data', title, imageSrcs }: SortiumCapsuleProps) {
	const glowModule = findModule((m) => m.LibraryImageBackgroundGlow) || {};
	const layoutModule = findModule((m) => m.CapsuleVisible) || {};
	const dragModule = findModule((m) => m.GhostContainer) || {};
	const imageModule = findModule((m) => m.GreyBackground) || {};

	const [srcIndex, setSrcIndex] = useState(0);
	const currentSrc = imageSrcs[srcIndex] || imageSrcs[imageSrcs.length - 1];

	const handleImageError = () => {
		if (srcIndex < imageSrcs.length - 1) {
			setSrcIndex(srcIndex + 1);
		}
	};

	const handleClick = () => {
		Navigation.Navigate(`/library/app/${appId}`);
	};

	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		triggerCapsuleMenu(e, appId);
	};

	return (
		<div
			className={`${layoutModule.Draggable} ${layoutModule.HoversEnabled} ${dragModule.Draggable}`}
			draggable="false"
			onClick={handleClick}
			onContextMenu={handleContextMenu}
			style={{ cursor: 'pointer' }}
		>
			<div role="link" className={`${layoutModule.LibraryItemBox} ${layoutModule.Portrait} ${layoutModule.InCollection} Panel`} tabIndex={0}>
				<div
					className={`${imageModule.Container} ${imageModule.GreyBackground} ${imageModule.PortraitImage} ${layoutModule.PortraitImage} ${layoutModule.Capsule} ${layoutModule.CapsuleVisible}`}
				>
					<img className={`${imageModule.Image} ${imageModule.Visibility} ${imageModule.Visible}`} src={currentSrc} alt={title} onError={handleImageError} />
				</div>

				<div className={`${layoutModule.LibraryItemBoxShine} ${layoutModule.Portrait}`}></div>
			</div>

			<div style={{ display: 'none' }}>{title}</div>

			<div className={layoutModule.LibraryItemBoxSubscript}>{metricText}</div>

			<div className={`${imageModule.Container} ${imageModule.GreyBackground} ${imageModule.PortraitImage} ${glowModule.LibraryImageBackgroundGlow}`}>
				<img role="presentation" className={`${imageModule.Image} ${imageModule.Visibility} ${imageModule.Visible}`} src={currentSrc} alt="" onError={handleImageError} />
			</div>
		</div>
	);
}
