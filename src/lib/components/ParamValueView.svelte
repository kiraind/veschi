<script lang="ts">
	import { Badge } from 'flowbite-svelte';
	import { formatFileSize, formatParamValue, type ParamView } from '$lib/domain/params';
	import { shortenFileName, shortenUrl } from '$lib/domain/shorten';

	/**
	 * The value of one stored parameter: links for URLs, files and references.
	 * Long links show their beginning with the domain, long file names their
	 * beginning and end with the extension; the full value is in the tooltip.
	 */
	let { param }: { param: ParamView } = $props();
</script>

{#if param.valueType === 'URL'}
	<a
		class="text-primary-700 hover:underline dark:text-primary-400"
		href={param.url}
		target="_blank"
		rel="noopener noreferrer"
		title={param.url}>{shortenUrl(param.url)}</a
	>
{:else if param.valueType === 'FILE'}
	<a
		class="text-primary-700 hover:underline dark:text-primary-400"
		href="/files/{param.fileKey}"
		target="_blank"
		title={param.fileName}>{shortenFileName(param.fileName)}</a
	>
	<span class="text-sm text-gray-500 dark:text-gray-400">{formatFileSize(param.fileSize)}</span>
{:else if param.valueType === 'REF' && param.ref}
	<a
		class="text-primary-700 hover:underline dark:text-primary-400"
		href="/{param.ref.kind === 'item' ? 'items' : 'types'}/{param.ref.id}">→ {param.ref.name}</a
	>
	{#if param.ref.archived}<Badge color="gray" class="ms-1">в архиве</Badge>{/if}
{:else}
	{formatParamValue(param)}
{/if}
