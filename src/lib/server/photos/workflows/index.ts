import cutoutGraph from './cutout.json';

/**
 * A ComfyUI workflow in API format («Export (API)» in the ComfyUI editor) and
 * the ids of its nodes the app talks to: the LoadImage node that gets the
 * uploaded picture and the SaveImage node whose output is the result. After
 * re-exporting a workflow from the editor, check these ids.
 */
export interface Workflow {
	graph: Record<string, { class_type: string; inputs: Record<string, unknown> }>;
	inputNode: string;
	outputNode: string;
}

/** Background removal: BiRefNet_dynamic of ComfyUI-RMBG, alpha with refined edge colours. */
export const CUTOUT: Workflow = { graph: cutoutGraph, inputNode: '1', outputNode: '3' };

/** The graph to submit, with the uploaded picture in its input node. */
export function withInput(workflow: Workflow, image: string): Workflow['graph'] {
	const graph = structuredClone(workflow.graph);
	const node = graph[workflow.inputNode];
	if (node?.class_type !== 'LoadImage') {
		throw new Error(`Workflow node ${workflow.inputNode} is not LoadImage`);
	}
	node.inputs.image = image;
	return graph;
}
