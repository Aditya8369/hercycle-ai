/**
 * Resilient clipboard copy utility with modern Clipboard API and fallback support.
 *
 * Handles environments where `navigator.clipboard` is unavailable, restricted,
 * or rejected due to iframe / non-HTTPS permissions.
 *
 * @param {string} text The string to copy
 * @returns {Promise<boolean>} Resolves with true if copied successfully, false otherwise
 */
export async function copyToClipboard(text) {
  if (typeof window === 'undefined' || !text) {
    return false
  }

  // Attempt modern asynchronous Clipboard API first
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (err) {
    // Permission denied or insecure context — proceed to textarea fallback
    console.warn('navigator.clipboard.writeText failed, using fallback:', err)
  }

  // Graceful fallback for legacy browsers, iframes, or non-secure contexts
  try {
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    textArea.setAttribute('readonly', '')
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textArea)
    return Boolean(successful)
  } catch (err) {
    console.error('execCommand copy fallback failed:', err)
    return false
  }
}
