import 'bootstrap/dist/css/bootstrap.min.css'
import './recovery.css'
import { reconstructShares } from './reconstruct.js'

const shareInputs = document.getElementById('share-inputs')
const errorElement = document.getElementById('error')
const resultElement = document.getElementById('result')
const resultTitle = document.getElementById('result-title')
const resultBody = document.getElementById('result-body')

function setError(message = '') {
	errorElement.textContent = message
	errorElement.classList.toggle('d-none', !message)
}

function addShareInput() {
	const index = shareInputs.children.length + 1
	const wrapper = document.createElement('div')
	wrapper.className = 'mb-3'

	const label = document.createElement('label')
	label.className = 'form-label fw-semibold'
	label.textContent = `Shard ${index}`

	const textarea = document.createElement('textarea')
	textarea.className = 'form-control font-monospace'
	textarea.rows = 3
	textarea.placeholder = 'Enter UR string (ur:envelope/...)'
	textarea.autocomplete = 'off'
	textarea.spellcheck = false

	wrapper.append(label, textarea)
	shareInputs.append(wrapper)
}

function addCopyButton(value) {
	const button = document.createElement('button')
	button.className = 'btn btn-outline-success mt-3'
	button.type = 'button'
	button.textContent = 'Copy to Clipboard'
	button.addEventListener('click', () => navigator.clipboard.writeText(value))
	resultBody.append(button)
}

function showResult(result) {
	resultBody.replaceChildren()

	if (result.mnemonic) {
		resultTitle.textContent = 'Recovered Seed Phrase'
		const seedDisplay = document.createElement('div')
		seedDisplay.className = 'seed-display'
		for (const [index, word] of result.mnemonic.split(' ').entries()) {
			const wordElement = document.createElement('span')
			wordElement.className = 'seed-word'
			wordElement.dataset.index = index + 1
			wordElement.textContent = word
			seedDisplay.append(wordElement)
		}
		resultBody.append(seedDisplay)

		if (result.privateNote) {
			const note = document.createElement('div')
			note.className = 'mt-3 p-2 note'
			const label = document.createElement('strong')
			label.textContent = 'Secret Text: '
			note.append(label, document.createTextNode(result.privateNote))
			resultBody.append(note)
		}
		addCopyButton(result.mnemonic)
	} else {
		resultTitle.textContent = 'Recovered Secret Text'
		const secretText = document.createElement('div')
		secretText.className = 'secret-text'
		secretText.textContent = result.secretText
		resultBody.append(secretText)
		addCopyButton(result.secretText)
	}

	resultElement.classList.remove('d-none')
}

document.getElementById('add-share').addEventListener('click', addShareInput)
document.getElementById('reconstruct').addEventListener('click', () => {
	setError()
	resultElement.classList.add('d-none')
	try {
		const values = Array.from(shareInputs.querySelectorAll('textarea'), (input) => input.value)
		showResult(reconstructShares(values))
	} catch (error) {
		setError(`Failed to reconstruct: ${error.message}`)
	}
})

addShareInput()
addShareInput()
