<script lang="ts">
	import {
		ArchiveOutline,
		BedOutline,
		BookOpenOutline,
		BriefcaseOutline,
		BuildingOutline,
		CameraPhotoOutline,
		CarrotOutline,
		DesktopPcOutline,
		FlaskOutline,
		HammerOutline,
		HomeOutline,
		MusicOutline,
		PaletteOutline,
		SunOutline,
		ToolsOutline,
		TruckOutline
	} from 'flowbite-svelte-icons';
	import { workbenchIconKey, type WorkbenchIconKey } from '$lib/domain/workbench-icons';

	const COMPONENTS: Record<WorkbenchIconKey, typeof HomeOutline> = {
		desktop: DesktopPcOutline,
		home: HomeOutline,
		garage: TruckOutline,
		tools: ToolsOutline,
		hammer: HammerOutline,
		briefcase: BriefcaseOutline,
		building: BuildingOutline,
		kitchen: CarrotOutline,
		garden: SunOutline,
		bed: BedOutline,
		book: BookOpenOutline,
		palette: PaletteOutline,
		music: MusicOutline,
		camera: CameraPhotoOutline,
		lab: FlaskOutline,
		storage: ArchiveOutline
	};

	/** Decorative (aria-hidden): the bench name next to it says what it is. */
	let { icon, class: className = 'h-5 w-5' }: { icon: string | null | undefined; class?: string } =
		$props();

	const Icon = $derived(COMPONENTS[workbenchIconKey(icon)]);
</script>

<Icon class={className} />
