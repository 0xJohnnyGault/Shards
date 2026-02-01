/* Shim to prevent loading 500kb of crap */
import { cbor, cborData, decodeCbor, MajorType } from '@bcts/dcbor'
import { KNOWN_VALUE, Digest } from '@bcts/components'

export const TAG_KNOWN_VALUE = KNOWN_VALUE.value
export const KNOWN_VALUE_TAG = KNOWN_VALUE

export class KnownValue {
	constructor(value, assignedName) {
		this._value = typeof value === 'bigint' ? value : BigInt(value)
		this._assignedName = assignedName
	}

	value() {
		if (this._value > BigInt(Number.MAX_SAFE_INTEGER)) {
			throw new RangeError(`KnownValue ${this._value} exceeds MAX_SAFE_INTEGER. Use valueBigInt() instead.`)
		}
		return Number(this._value)
	}

	valueBigInt() {
		return this._value
	}

	assignedName() {
		return this._assignedName
	}

	name() {
		return this._assignedName ?? this._value.toString()
	}

	equals(other) {
		return this._value === other._value
	}

	hashCode() {
		return Number(this._value & BigInt(0xffffffff))
	}

	digest() {
		return Digest.fromImage(this.toCborData())
	}

	toString() {
		return this.name()
	}

	cborTags() {
		return [KNOWN_VALUE_TAG]
	}

	untaggedCbor() {
		return cbor(this._value)
	}

	taggedCbor() {
		return cbor({
			tag: TAG_KNOWN_VALUE,
			value: this._value,
		})
	}

	toCborData() {
		return cborData(this.taggedCbor())
	}

	taggedCborData() {
		return this.toCborData()
	}

	fromUntaggedCbor(cborValue) {
		return KnownValue.fromUntaggedCbor(cborValue)
	}

	fromTaggedCbor(cborValue) {
		return KnownValue.fromTaggedCbor(cborValue)
	}

	static fromUntaggedCbor(cborValue) {
		if (cborValue.type !== MajorType.Unsigned) {
			throw new Error(`Expected unsigned integer for KnownValue, got major type ${cborValue.type}`)
		}
		const numValue = cborValue.value
		return new KnownValue(typeof numValue === 'bigint' ? numValue : BigInt(numValue))
	}

	static fromTaggedCbor(cborValue) {
		if (cborValue.type !== MajorType.Tagged) {
			throw new Error(`Expected tagged CBOR for KnownValue, got major type ${cborValue.type}`)
		}
		const tag = cborValue.tag
		if (tag !== BigInt(TAG_KNOWN_VALUE) && tag !== TAG_KNOWN_VALUE) {
			throw new Error(`Expected tag ${TAG_KNOWN_VALUE} for KnownValue, got ${tag}`)
		}
		return KnownValue.fromUntaggedCbor(cborValue.value)
	}

	static fromCborData(data) {
		const cborValue = decodeCbor(data)
		return KnownValue.fromTaggedCbor(cborValue)
	}

	static fromCbor(cborValue) {
		if (cborValue.type === MajorType.Tagged) return KnownValue.fromTaggedCbor(cborValue)
		return KnownValue.fromUntaggedCbor(cborValue)
	}
}

export class KnownValuesStore {
	constructor(knownValues = []) {
		this.knownValuesByRawValue = new Map()
		this.knownValuesByAssignedName = new Map()
		for (const knownValue of knownValues) {
			this._insert(knownValue)
		}
	}

	insert(knownValue) {
		this._insert(knownValue)
	}

	assignedName(knownValue) {
		return this.knownValuesByRawValue.get(knownValue.valueBigInt())?.assignedName()
	}

	name(knownValue) {
		return this.assignedName(knownValue) ?? knownValue.name()
	}

	knownValueNamed(assignedName) {
		return this.knownValuesByAssignedName.get(assignedName)
	}

	knownValueForValue(rawValue) {
		const key = typeof rawValue === 'bigint' ? rawValue : BigInt(rawValue)
		return this.knownValuesByRawValue.get(key)
	}

	static knownValueForRawValue(rawValue, knownValues) {
		if (knownValues !== undefined) {
			const value = knownValues.knownValueForValue(rawValue)
			if (value !== undefined) return value
		}
		return new KnownValue(rawValue)
	}

	static knownValueForName(name, knownValues) {
		return knownValues?.knownValueNamed(name)
	}

	static nameForKnownValue(knownValue, knownValues) {
		if (knownValues !== undefined) {
			const assignedName = knownValues.assignedName(knownValue)
			if (assignedName !== undefined && assignedName !== '') return assignedName
		}
		return knownValue.name()
	}

	clone() {
		const cloned = new KnownValuesStore()
		cloned.knownValuesByRawValue = new Map(this.knownValuesByRawValue)
		cloned.knownValuesByAssignedName = new Map(this.knownValuesByAssignedName)
		return cloned
	}

	_insert(knownValue) {
		const existing = this.knownValuesByRawValue.get(knownValue.valueBigInt())
		if (existing !== undefined) {
			const oldName = existing.assignedName()
			if (oldName !== undefined && oldName !== '') {
				this.knownValuesByAssignedName.delete(oldName)
			}
		}

		this.knownValuesByRawValue.set(knownValue.valueBigInt(), knownValue)
		const assignedName = knownValue.assignedName()
		if (assignedName !== undefined && assignedName !== '') {
			this.knownValuesByAssignedName.set(assignedName, knownValue)
		}
	}
}

export const UNIT = new KnownValue(0, '')
export const IS_A = new KnownValue(1, 'isA')
export const SIGNED = new KnownValue(3, 'signed')
export const NOTE = new KnownValue(4, 'note')
export const HAS_RECIPIENT = new KnownValue(5, 'hasRecipient')
export const SSKR_SHARE = new KnownValue(6, 'sskrShare')
export const SALT = new KnownValue(15, 'salt')
export const DATE = new KnownValue(16, 'date')
export const UNKNOWN_VALUE = new KnownValue(17, 'Unknown')
export const HAS_SECRET = new KnownValue(19, 'hasSecret')
export const POSITION = new KnownValue(23, 'position')
export const ATTACHMENT = new KnownValue(50, 'attachment')
export const VENDOR = new KnownValue(51, 'vendor')
export const CONFORMS_TO = new KnownValue(52, 'conformsTo')
export const BODY = new KnownValue(100, 'body')
export const RESULT = new KnownValue(101, 'result')
export const ERROR = new KnownValue(102, 'error')
export const OK_VALUE = new KnownValue(103, 'OK')
export const CONTENT = new KnownValue(108, 'content')
export const EDGE = new KnownValue(701, 'edge')
export const SOURCE = new KnownValue(702, 'source')
export const TARGET = new KnownValue(703, 'target')

export class LazyKnownValues {
	constructor() {
		this._data = undefined
	}

	get() {
		if (this._data === undefined) {
			this._data = new KnownValuesStore([UNIT, IS_A, SIGNED, NOTE, HAS_RECIPIENT, SSKR_SHARE, SALT, DATE, UNKNOWN_VALUE, HAS_SECRET, POSITION, ATTACHMENT, VENDOR, CONFORMS_TO, BODY, RESULT, ERROR, OK_VALUE, CONTENT, EDGE, SOURCE, TARGET])
		}
		return this._data
	}
}

export const KNOWN_VALUES = new LazyKnownValues()
