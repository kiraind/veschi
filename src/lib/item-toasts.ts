import { invalidateAll } from '$app/navigation';
import { api } from '$lib/api';
import { toast } from '$lib/toast.svelte';

/** The toast after an item went to the archive: «Отменить» brings it back. */
export function archivedToast(message: string, itemId: string): void {
	toast({
		message,
		action: {
			label: 'Отменить',
			run: async () => {
				await api.post(`/api/items/${itemId}/restore`);
				await invalidateAll();
				toast({
					message: 'Вернули из архива',
					link: { href: `/items/${itemId}`, label: 'Открыть' }
				});
			}
		}
	});
}
