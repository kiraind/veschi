<script lang="ts">
	import { ClockOutline } from 'flowbite-svelte-icons';
	import { historyHref } from '$lib/domain/history';

	/** Link to the history («История») of one item, type, parameter or category. */
	let { id }: { id: string } = $props();
</script>

<a
	class="inline-flex min-h-10 items-center gap-1.5 text-sm text-primary-700 hover:underline dark:text-primary-400"
	href={historyHref({ entity: id })}
>
	<ClockOutline class="h-4 w-4" />История изменений
</a>
