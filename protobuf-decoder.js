// POE Ninja Protobuf Decoder
// Based on the schema extracted from poe.ninja's JavaScript

class ProtobufReader {
    constructor(buffer) {
        this.buffer = new Uint8Array(buffer);
        this.pos = 0;
    }

    readVarint() {
        let result = 0;
        let shift = 0;
        while (this.pos < this.buffer.length) {
            const byte = this.buffer[this.pos++];
            result |= (byte & 0x7F) << shift;
            if ((byte & 0x80) === 0) break;
            shift += 7;
        }
        return result;
    }

    readString() {
        const length = this.readVarint();
        const result = new TextDecoder().decode(this.buffer.slice(this.pos, this.pos + length));
        this.pos += length;
        return result;
    }

    readBytes() {
        const length = this.readVarint();
        const result = this.buffer.slice(this.pos, this.pos + length);
        this.pos += length;
        return result;
    }

    readDouble() {
        const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.pos);
        this.pos += 8;
        return view.getFloat64(0, true); // little endian
    }

    readFloat() {
        const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.pos);
        this.pos += 4;
        return view.getFloat32(0, true); // little endian
    }

    readInt32() {
        const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + this.pos);
        this.pos += 4;
        return view.getInt32(0, true); // little endian
    }

    readBool() {
        return this.readVarint() !== 0;
    }

    hasMore() {
        return this.pos < this.buffer.length;
    }

    readField() {
        if (!this.hasMore()) return null;
        
        const tag = this.readVarint();
        const fieldNumber = tag >> 3;
        const wireType = tag & 0x7;
        
        return { fieldNumber, wireType };
    }
}

// Protobuf message classes based on poe.ninja schema
class SearchResultValue {
    constructor() {
        this.str = '';
        this.number = 0;
        this.numbers = [];
        this.strs = [];
        this.boolean = false;
    }

    static fromBinary(data) {
        const reader = new ProtobufReader(data);
        const value = new SearchResultValue();
        
        while (reader.hasMore()) {
            const field = reader.readField();
            if (!field) break;
            
            switch (field.fieldNumber) {
                case 1: // str
                    if (field.wireType === 2) value.str = reader.readString();
                    break;
                case 2: // number
                    if (field.wireType === 0) value.number = reader.readVarint();
                    break;
                case 3: // numbers (repeated)
                    if (field.wireType === 2) {
                        const bytes = reader.readBytes();
                        const subReader = new ProtobufReader(bytes);
                        while (subReader.hasMore()) {
                            value.numbers.push(subReader.readVarint());
                        }
                    } else if (field.wireType === 0) {
                        value.numbers.push(reader.readVarint());
                    }
                    break;
                case 4: // strs (repeated)
                    if (field.wireType === 2) value.strs.push(reader.readString());
                    break;
                case 5: // boolean
                    if (field.wireType === 0) value.boolean = reader.readBool();
                    break;
                default:
                    // Skip unknown fields
                    this.skipField(reader, field.wireType);
                    break;
            }
        }
        
        return value;
    }

    static skipField(reader, wireType) {
        switch (wireType) {
            case 0: reader.readVarint(); break;
            case 1: reader.pos += 8; break;
            case 2: reader.pos += reader.readVarint(); break;
            case 5: reader.pos += 4; break;
        }
    }
}

class SearchResultValueList {
    constructor() {
        this.id = '';
        this.values = [];
    }

    static fromBinary(data) {
        const reader = new ProtobufReader(data);
        const valueList = new SearchResultValueList();
        
        while (reader.hasMore()) {
            const field = reader.readField();
            if (!field) break;
            
            switch (field.fieldNumber) {
                case 1: // id
                    if (field.wireType === 2) valueList.id = reader.readString();
                    break;
                case 2: // values (repeated)
                    if (field.wireType === 2) {
                        const bytes = reader.readBytes();
                        const value = SearchResultValue.fromBinary(bytes);
                        valueList.values.push(value);
                    }
                    break;
                default:
                    SearchResultValue.skipField(reader, field.wireType);
                    break;
            }
        }
        
        return valueList;
    }
}

class SearchResultDictionaryProperty {
    constructor() {
        this.id = '';
        this.values = [];
    }

    static fromBinary(data) {
        const reader = new ProtobufReader(data);
        const property = new SearchResultDictionaryProperty();
        
        while (reader.hasMore()) {
            const field = reader.readField();
            if (!field) break;
            
            switch (field.fieldNumber) {
                case 1: // id
                    if (field.wireType === 2) property.id = reader.readString();
                    break;
                case 2: // values (repeated)
                    if (field.wireType === 2) property.values.push(reader.readString());
                    break;
                default:
                    SearchResultValue.skipField(reader, field.wireType);
                    break;
            }
        }
        
        return property;
    }
}

class SearchResultDictionary {
    constructor() {
        this.id = '';
        this.values = [];
        this.properties = [];
    }

    static fromBinary(data) {
        const reader = new ProtobufReader(data);
        const dictionary = new SearchResultDictionary();
        
        while (reader.hasMore()) {
            const field = reader.readField();
            if (!field) break;
            
            switch (field.fieldNumber) {
                case 1: // id
                    if (field.wireType === 2) dictionary.id = reader.readString();
                    break;
                case 2: // values (repeated)
                    if (field.wireType === 2) dictionary.values.push(reader.readString());
                    break;
                case 3: // properties (repeated)
                    if (field.wireType === 2) {
                        const bytes = reader.readBytes();
                        const property = SearchResultDictionaryProperty.fromBinary(bytes);
                        dictionary.properties.push(property);
                    }
                    break;
                default:
                    SearchResultValue.skipField(reader, field.wireType);
                    break;
            }
        }
        
        return dictionary;
    }
}

class SearchResultDimensionCount {
    constructor() {
        this.key = 0;
        this.count = 0;
    }

    static fromBinary(data) {
        const reader = new ProtobufReader(data);
        const count = new SearchResultDimensionCount();
        
        while (reader.hasMore()) {
            const field = reader.readField();
            if (!field) break;
            
            switch (field.fieldNumber) {
                case 1: // key
                    if (field.wireType === 0) count.key = reader.readVarint();
                    break;
                case 2: // count
                    if (field.wireType === 0) count.count = reader.readVarint();
                    break;
                default:
                    SearchResultValue.skipField(reader, field.wireType);
                    break;
            }
        }
        
        return count;
    }
}

class SearchResultDimension {
    constructor() {
        this.id = '';
        this.dictionaryId = '';
        this.counts = [];
    }

    static fromBinary(data) {
        const reader = new ProtobufReader(data);
        const dimension = new SearchResultDimension();
        
        while (reader.hasMore()) {
            const field = reader.readField();
            if (!field) break;
            
            switch (field.fieldNumber) {
                case 1: // id
                    if (field.wireType === 2) dimension.id = reader.readString();
                    break;
                case 2: // dictionary_id
                    if (field.wireType === 2) dimension.dictionaryId = reader.readString();
                    break;
                case 3: // counts (repeated)
                    if (field.wireType === 2) {
                        const bytes = reader.readBytes();
                        const count = SearchResultDimensionCount.fromBinary(bytes);
                        dimension.counts.push(count);
                    }
                    break;
                default:
                    SearchResultValue.skipField(reader, field.wireType);
                    break;
            }
        }
        
        return dimension;
    }
}

class SearchResult {
    constructor() {
        this.total = 0;
        this.dimensions = [];
        this.valueLists = [];
        this.dictionaries = [];
    }

    static fromBinary(data) {
        const reader = new ProtobufReader(data);
        const result = new SearchResult();
        
        while (reader.hasMore()) {
            const field = reader.readField();
            if (!field) break;
            
            switch (field.fieldNumber) {
                case 1: // total
                    if (field.wireType === 0) result.total = reader.readVarint();
                    break;
                case 2: // dimensions (repeated)
                    if (field.wireType === 2) {
                        const bytes = reader.readBytes();
                        const dimension = SearchResultDimension.fromBinary(bytes);
                        result.dimensions.push(dimension);
                    }
                    break;
                case 5: // value_lists (repeated)
                    if (field.wireType === 2) {
                        const bytes = reader.readBytes();
                        const valueList = SearchResultValueList.fromBinary(bytes);
                        result.valueLists.push(valueList);
                    }
                    break;
                case 6: // dictionaries (repeated) - these are references, not full dictionaries
                    if (field.wireType === 2) {
                        const bytes = reader.readBytes();
                        // This is actually SearchResultDictionaryReference, simplified for now
                        const reader2 = new ProtobufReader(bytes);
                        const dictRef = { id: '', hash: '' };
                        while (reader2.hasMore()) {
                            const subField = reader2.readField();
                            if (!subField) break;
                            if (subField.fieldNumber === 1 && subField.wireType === 2) {
                                dictRef.id = reader2.readString();
                            } else if (subField.fieldNumber === 2 && subField.wireType === 2) {
                                dictRef.hash = reader2.readString();
                            } else {
                                SearchResultValue.skipField(reader2, subField.wireType);
                            }
                        }
                        result.dictionaries.push(dictRef);
                    }
                    break;
                default:
                    // Skip other fields for now
                    SearchResultValue.skipField(reader, field.wireType);
                    break;
            }
        }
        
        return result;
    }
}

class NinjaSearchResult {
    constructor() {
        this.result = null;
    }

    static fromBinary(data) {
        const reader = new ProtobufReader(data);
        const ninjaResult = new NinjaSearchResult();
        
        while (reader.hasMore()) {
            const field = reader.readField();
            if (!field) break;
            
            switch (field.fieldNumber) {
                case 1: // result
                    if (field.wireType === 2) {
                        const bytes = reader.readBytes();
                        ninjaResult.result = SearchResult.fromBinary(bytes);
                    }
                    break;
                default:
                    SearchResultValue.skipField(reader, field.wireType);
                    break;
            }
        }
        
        return ninjaResult;
    }
}

// Export for use in HTML
if (typeof window !== 'undefined') {
    window.ProtobufDecoder = {
        NinjaSearchResult,
        SearchResult,
        SearchResultDictionary
    };
}