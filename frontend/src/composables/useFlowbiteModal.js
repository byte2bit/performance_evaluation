import { onMounted, onBeforeUnmount, watch } from 'vue'
import { Modal } from 'flowbite'

let activeModal = null
const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

export function useFlowbiteModal(element, visible) {
    let modal = null
    let previousFocus = null

    function focusableElements() {
        return [...element.value.querySelectorAll(focusableSelector)]
            .filter(target => target.getClientRects().length > 0)
    }

    function trapFocus(event) {
        if (event.key !== 'Tab' || !modal?.isVisible()) return
        const targets = focusableElements()
        const first = targets[0]
        const last = targets[targets.length - 1]
        if (!first) {
            event.preventDefault()
            element.value.focus()
        } else if (event.shiftKey && element.value.ownerDocument.activeElement === first) {
            event.preventDefault()
            last.focus()
        } else if (!event.shiftKey && element.value.ownerDocument.activeElement === last) {
            event.preventDefault()
            first.focus()
        }
    }

    function syncVisibility() {
        if (!modal) return
        if (visible.value && !modal.isVisible()) {
            if (activeModal && activeModal !== modal) activeModal.hide()
            modal.show()
        } else if (!visible.value && modal.isVisible()) {
            modal.hide()
        }
    }

    onMounted(() => {
        modal = new Modal(element.value, {
            onShow() {
                activeModal = modal
                previousFocus = element.value.ownerDocument.activeElement
                visible.value = true
                const target = focusableElements()[0] || element.value
                target.focus()
            },
            onHide() {
                if (activeModal === modal) activeModal = null
                visible.value = false
                if (previousFocus?.isConnected) previousFocus.focus()
                previousFocus = null
            }
        }, { id: element.value.id, override: false })
        element.value.addEventListener('keydown', trapFocus)
        syncVisibility()
    })

    watch(visible, syncVisibility, { flush: 'post' })

    onBeforeUnmount(() => {
        if (!modal) return
        if (modal.isVisible()) modal.hide()
        element.value.removeEventListener('keydown', trapFocus)
        modal.destroyAndRemoveInstance()
        modal = null
    })
}
