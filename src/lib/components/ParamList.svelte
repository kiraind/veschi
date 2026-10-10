<script lang="ts">
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
	<p class="muted">Параметров нет.</p>
{:else}
	<dl class="params">
		{#each params as param (param.id)}
			<div class="param">
				<dt>
					{param.key}
					{#if showSource && param.source === 'type'}<span class="muted" title="Параметр типа"
							>· тип</span
						>{/if}
				</dt>
				<dd>
					{#if param.valueType === 'URL'}
						<a href={param.url} target="_blank" rel="noopener noreferrer">{param.url}</a>
					{:else if param.valueType === 'FILE'}
						<a href="/files/{param.fileKey}" target="_blank">{param.fileName}</a>
						<span class="muted">{formatFileSize(param.fileSize)}</span>
					{:else if param.valueType === 'REF' && param.ref}
						<a href="/{param.ref.kind === 'item' ? 'items' : 'types'}/{param.ref.id}"
							>→ {param.ref.name}</a
						>
						{#if param.ref.archived}<span class="badge">в архиве</span>{/if}
					{:else}
						{formatParamValue(param)}
					{/if}
				</dd>
			</div>
		{/each}
	</dl>
{/if}

<style>
	.params {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.param {
		display: grid;
		grid-template-columns: minmax(6rem, 40%) 1fr;
		gap: 0.75rem;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
</style>
