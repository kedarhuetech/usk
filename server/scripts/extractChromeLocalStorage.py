import os
import glob
import json
import struct

def read_varint(data, pos):
    val = 0
    shift = 0
    while pos < len(data):
        b = data[pos]
        pos += 1
        val |= (b & 0x7f) << shift
        if not (b & 0x80):
            break
        shift += 7
    return val, pos

def snappy_decompress(data):
    pos = 0
    length, pos = read_varint(data, pos)
    out = bytearray()
    while pos < len(data) and len(out) < length:
        b = data[pos]
        pos += 1
        tag = b & 3
        if tag == 0:
            lit_len = (b >> 2) + 1
            if lit_len > 60:
                extra = lit_len - 60
                lit_len = int.from_bytes(data[pos:pos+extra], 'little') + 1
                pos += extra
            out.extend(data[pos:pos+lit_len])
            pos += lit_len
        elif tag == 1:
            cpy_len = ((b >> 2) & 7) + 4
            offset = ((b & 0xe0) << 3) | data[pos]
            pos += 1
            for _ in range(cpy_len):
                out.append(out[-offset])
        elif tag == 2:
            cpy_len = (b >> 2) + 1
            offset = int.from_bytes(data[pos:pos+2], 'little')
            pos += 2
            for _ in range(cpy_len):
                out.append(out[-offset])
        elif tag == 3:
            cpy_len = (b >> 2) + 1
            offset = int.from_bytes(data[pos:pos+4], 'little')
            pos += 4
            for _ in range(cpy_len):
                out.append(out[-offset])
    return bytes(out)

def read_block(raw_file, offset, size):
    block_data = raw_file[offset : offset + size]
    comp_type = raw_file[offset + size]
    if comp_type == 0:
        return block_data
    elif comp_type == 1:
        return snappy_decompress(block_data)
    else:
        raise ValueError(f'Unknown compression type {comp_type}')

def parse_entries(block_bytes):
    num_restarts = int.from_bytes(block_bytes[-4:], 'little')
    entries_end = len(block_bytes) - (1 + num_restarts) * 4
    pos = 0
    prev_key = b''
    entries = []
    while pos < entries_end:
        shared_len, pos = read_varint(block_bytes, pos)
        unshared_len, pos = read_varint(block_bytes, pos)
        val_len, pos = read_varint(block_bytes, pos)
        key_delta = block_bytes[pos : pos + unshared_len]
        pos += unshared_len
        full_key = prev_key[:shared_len] + key_delta
        prev_key = full_key
        val = block_bytes[pos : pos + val_len]
        pos += val_len
        entries.append((full_key, val))
    return entries

def parse_sstable(raw_file):
    footer = raw_file[-48:]
    pos = 0
    meta_offset, pos = read_varint(footer, pos)
    meta_size, pos = read_varint(footer, pos)
    idx_offset, pos = read_varint(footer, pos)
    idx_size, pos = read_varint(footer, pos)
    
    idx_block = read_block(raw_file, idx_offset, idx_size)
    idx_entries = parse_entries(idx_block)
    
    all_kvs = []
    for k, v in idx_entries:
        vpos = 0
        b_offset, vpos = read_varint(v, vpos)
        b_size, vpos = read_varint(v, vpos)
        data_block = read_block(raw_file, b_offset, b_size)
        data_entries = parse_entries(data_block)
        all_kvs.extend(data_entries)
    return all_kvs

def decode_val(raw_val):
    if not raw_val:
        return None
    prefix = raw_val[0]
    payload = raw_val[1:]
    if prefix == 1:  # UTF-8
        try:
            return payload.decode('utf-8', errors='replace')
        except Exception:
            return None
    elif prefix == 0:  # UTF-16LE
        try:
            return payload.decode('utf-16le', errors='replace')
        except Exception:
            return None
    else:
        try:
            return raw_val.decode('utf-8', errors='replace')
        except Exception:
            return None

def extract_all():
    db_dirs = [
        r'C:\Users\PC\AppData\Local\Google\Chrome\User Data\Profile 4\Local Storage\leveldb',
        r'C:\Users\PC\AppData\Local\Google\Chrome\User Data\Default\Local Storage\leveldb'
    ]
    
    # Store key -> (seq, val_str)
    all_data = {}
    
    for db_dir in db_dirs:
        if not os.path.exists(db_dir):
            continue
        ldb_files = sorted(glob.glob(os.path.join(db_dir, '*.ldb')))
        for fpath in ldb_files:
            try:
                with open(fpath, 'rb') as fp:
                    raw = fp.read()
                if raw[-8:] != bytes.fromhex('57fb808b247547db'):
                    continue
                kvs = parse_sstable(raw)
                for full_key, raw_val in kvs:
                    # Look for localhost:5173 or devtunnels
                    # Internal key format: [8-byte seq/type at end]
                    if len(full_key) < 8:
                        continue
                    user_key = full_key[:-8]
                    tag = full_key[-8]
                    seq = int.from_bytes(full_key[-7:], 'little')
                    
                    target_origins = [b'_http://localhost:5173\x00\x01', b'_https://ws739zgw-5173.inc1.devtunnels.ms\x00\x01']
                    matched_origin = None
                    for orig in target_origins:
                        if user_key.startswith(orig):
                            matched_origin = orig
                            break
                    if matched_origin:
                        storage_key = user_key[len(matched_origin):].decode('utf-8', errors='ignore')
                        # Check deletion (tag == 0)
                        if tag == 0:
                            if storage_key in all_data and seq > all_data[storage_key][0]:
                                del all_data[storage_key]
                        else:
                            val_str = decode_val(raw_val)
                            if storage_key not in all_data or seq > all_data[storage_key][0]:
                                all_data[storage_key] = (seq, val_str)
            except Exception as e:
                print(f'Error reading {fpath}: {e}')
                
    result = {}
    for k, (seq, val_str) in all_data.items():
        if val_str is None:
            continue
        try:
            parsed = json.loads(val_str)
            result[k] = parsed
        except Exception:
            result[k] = val_str
            
    return result

if __name__ == '__main__':
    data = extract_all()
    print(f'Successfully extracted {len(data)} localStorage keys from Chrome LevelDB!')
    for k in sorted(data.keys()):
        val = data[k]
        if isinstance(val, list):
            print(f'  {k}: {len(val)} items')
        elif isinstance(val, dict):
            print(f'  {k}: dict with {len(val)} keys')
        else:
            print(f'  {k}: {str(val)[:40]}')
            
    with open('current_browser_storage.json', 'w', encoding='utf-8') as fp:
        json.dump(data, fp, indent=2)
    print('Saved to current_browser_storage.json')
