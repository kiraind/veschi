import { createHash, createHmac } from 'node:crypto';

/** SHA-256 of an empty body, as S3 expects in x-amz-content-sha256 for GET, HEAD and DELETE. */
export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export function sha256Hex(data: string | Buffer): string {
	return createHash('sha256').update(data).digest('hex');
}

function hmac(key: string | Buffer, data: string): Buffer {
	return createHmac('sha256', key).update(data).digest();
}

/** Percent-encodes a path segment or query value as SigV4 requires (RFC 3986 unreserved set). */
export function uriEncode(value: string): string {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
	);
}

export interface SignInput {
	method: string;
	url: URL;
	/** Headers to sign, lower-case names; must include host, x-amz-date and x-amz-content-sha256. */
	headers: Record<string, string>;
	accessKey: string;
	secretKey: string;
	region: string;
}

/**
 * The Authorization header of an AWS Signature Version 4 request to S3
 * (https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html).
 * The path of `url` must already be encoded.
 */
export function authorization({
	method,
	url,
	headers,
	accessKey,
	secretKey,
	region
}: SignInput): string {
	const amzDate = headers['x-amz-date']!;
	const day = amzDate.slice(0, 8);
	const names = Object.keys(headers).sort();
	const query = [...url.searchParams]
		.map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`)
		.sort()
		.join('&');
	const canonicalRequest = [
		method,
		url.pathname,
		query,
		...names.map((n) => `${n}:${headers[n]!.trim()}`),
		'',
		names.join(';'),
		headers['x-amz-content-sha256']
	].join('\n');
	const scope = `${day}/${region}/s3/aws4_request`;
	const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
	const key = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), 's3'), 'aws4_request');
	const signature = createHmac('sha256', key).update(stringToSign).digest('hex');
	return `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
}
