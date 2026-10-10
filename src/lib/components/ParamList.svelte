<script lang="ts">
	import { Badge } from 'flowbite-svelte';
	import {
		formatFileSize,
		formatParamValue,
		type ParamSource,
		type ParamView
	} from '$lib/domain/params';

	/** Read-only parameter list; with `showSource`, values inherited from the type are marked. */
	let {
		params,
		showSource = false
	}: { params: (ParamView & { source?: ParamSource })[]; showSource?: boolean } = $props();
</script>

{#if params.length === 0}
	<p class="text-sm text-gray-500 dark:text-gray-400">Параметров нет.</p>
{:else}
	<dl class="m-0 flex flex-col gap-2">
		{#each params as param (param.id)}
			<div class="grid grid-cols-[minmax(6rem,40%)_1fr] gap-3">
				<dt class="text-gray-500 dark:text-gray-400 [overflow-wrap:anywhere]">
					{param.key}
					{#if showSource && param.source === 'type'}<span
							class="text-sm text-gray-500 dark:text-gray-400"
							title="Параметр типа">· тип</span
						>{/if}
				</dt>
				<dd class="m-0 [overflow-wrap:anywhere]">
					{#if param.valueType === 'URL'}
						<a
							class="text-primary-700 hover:underline dark:text-primary-400"
							href={param.url}
							target="_blank"
							rel="noopener noreferrer">{param.url}</a
						>
					{:else if param.valueType === 'FILE'}
						<a
							class="text-primary-700 hover:underline dark:text-primary-400"
							href="/files/{param.fileKey}"
							target="_blank">{param.fileName}</a
						>
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>{formatFileSize(param.fileSize)}</span
						>
					{:else if param.valueType === 'REF' && param.ref}
						<a
							class="text-primary-700 hover:underline dark:text-primary-400"
							href="/{param.ref.kind === 'item' ? 'items' : 'types'}/{param.ref.id}"
							>→ {param.ref.name}</a
						>
						{#if param.ref.archived}<Badge color="gray" class="ms-1">в архиве</Badge>{/if}
					{:else}
						{formatParamValue(param)}
					{/if}
				</dd>
			</div>
		{/each}
	</dl>
{/if}
