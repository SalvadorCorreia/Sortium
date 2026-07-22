import { findModule } from '@steambrew/client';

interface SortiumCapsuleProps {
	title?: string;
	imageSrc?: string;
	metricText?: string;
}

export function SortiumCapsule({
	title = 'Placeholder Game',
	imageSrc = 'https://steamcdn-a.akamaihd.net/steam/apps/400/library_600x900.jpg',
	metricText = 'Value',
}: SortiumCapsuleProps) {
	const glowModule = findModule((m) => m.LibraryImageBackgroundGlow) || {};
	const layoutModule = findModule((m) => m.CapsuleVisible) || {};
	const dragModule = findModule((m) => m.GhostContainer) || {};
	const imageModule = findModule((m) => m.GreyBackground) || {};

	return (
		<div role="gridcell" style={{ display: 'contents' }}>
			<div
				className={`${layoutModule.Draggable} ${layoutModule.Short} ${layoutModule.HoversEnabled} ${layoutModule.Small} ${dragModule.Draggable}`}
				draggable="true"
				onDragStart={(e) => e.preventDefault()}
			>
				<div role="link" className={`${layoutModule.LibraryItemBox} ${layoutModule.Portrait} ${layoutModule.InCollection} Panel`} tabIndex={0}>
					<div
						className={`${imageModule.Container} ${imageModule.GreyBackground} ${imageModule.PortraitImage} ${imageModule.Short} ${layoutModule.PortraitImage} ${layoutModule.Capsule} ${layoutModule.CapsuleVisible}`}
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
		</div>
	);
}
