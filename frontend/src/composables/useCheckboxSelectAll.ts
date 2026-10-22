import { type Ref, computed } from 'vue'

export const useCheckboxSelectAll = <T>(
    items: Ref<T[]>,
    selected: Ref<T[]>
) => {
    const checked = computed({
        get() {
            if (indeterminate.value) return true

            return selected.value.length > 0 &&
                selected.value.length === items.value.length
        },
        set(value) {
            if (value) selected.value = items.value
            else selected.value = []
        }
    })
    const indeterminate = computed<boolean>(() => {
        return selected.value.length > 0 &&
            selected.value.length < items.value.length
    })

    return {
        checked,
        indeterminate
    }
}