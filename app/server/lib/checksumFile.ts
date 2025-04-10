import {BinaryToTextEncoding, createHash, Hash} from 'crypto';
import * as fs from 'fs';
import {Readable, Transform, TransformCallback} from 'node:stream';

/**
 * Computes hash of the file at the given path, using 'sha1' by default, or any algorithm
 * supported by crypto.createHash().
 */
export async function checksumFile(filePath: string, algorithm: string = 'sha1'): Promise<string> {
  const stream = fs.createReadStream(filePath);
  return checksumFileStream(stream, algorithm);
}

export async function checksumFileStream(stream: Readable, algorithm: string = 'sha1'): Promise<string> {
  const shaSum = createHash(algorithm);
  try {
    stream.on('data', (data) => shaSum.update(data));
    await new Promise<void>((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    return shaSum.digest('hex');
  } finally {
    stream.removeAllListeners();      // Isn't strictly necessary.
  }
}

export class HashPassthroughStream extends Transform {
  private _hash: Hash;

  constructor(algorithm: string = 'sha1') {
    super();
    this._hash = createHash(algorithm);
  }

  public override _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
    this._hash.update(chunk, encoding);
    callback(null, chunk);
  }

  public getDigest(encoding: BinaryToTextEncoding = 'hex'): string {
    if (this.readable) {
      throw new Error("HashPassthroughStream must be closed before getting digest");
    }
    return this._hash.digest(encoding);
  }
}
