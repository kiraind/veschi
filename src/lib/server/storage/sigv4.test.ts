import { describe, expect, it } from 'vitest';
import { authorization, EMPTY_SHA256, sha256Hex, uriEncode } from './sigv4';

// Examples from https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
const credentials = {
	accessKey: 'AKIAIOSFODNN7EXAMPLE',
	secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
	region: 'us-east-1'
};

describe('authorization', () => {
	it('signs a GET object request like the AWS example', () => {
		expect(
			authorization({
				...credentials,
				method: 'GET',
				url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
				headers: {
					host: 'examplebucket.s3.amazonaws.com',
					range: 'bytes=0-9',
					'x-amz-content-sha256': EMPTY_SHA256,
					'x-amz-date': '20130524T000000Z'
				}
			})
		).toBe(
			'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
				'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
				'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41'
		);
	});

	it('signs a PUT object request like the AWS example', () => {
		const body = 'Welcome to Amazon S3.';
		expect(sha256Hex(body)).toBe(
			'44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072'
		);
		expect(
			authorization({
				...credentials,
				method: 'PUT',
				url: new URL(`https://examplebucket.s3.amazonaws.com/${uriEncode('test$file.text')}`),
				headers: {
					date: 'Fri, 24 May 2013 00:00:00 GMT',
					host: 'examplebucket.s3.amazonaws.com',
					'x-amz-content-sha256': sha256Hex(body),
					'x-amz-date': '20130524T000000Z',
					'x-amz-storage-class': 'REDUCED_REDUNDANCY'
				}
			})
		).toMatch(/Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd$/);
	});

	it('collapses spaces inside header values, as S3 does when it checks the signature', () => {
		const request = (contentType: string) =>
			authorization({
				...credentials,
				method: 'PUT',
				url: new URL('https://examplebucket.s3.amazonaws.com/a.txt'),
				headers: {
					'content-type': contentType,
					host: 'examplebucket.s3.amazonaws.com',
					'x-amz-content-sha256': EMPTY_SHA256,
					'x-amz-date': '20130524T000000Z'
				}
			});
		expect(request(' text/plain;   charset=utf-8 ')).toBe(request('text/plain; charset=utf-8'));
	});
});

describe('uriEncode', () => {
	it('encodes everything but unreserved characters', () => {
		expect(uriEncode("a b+c!'()*~-_.")).toBe('a%20b%2Bc%21%27%28%29%2A~-_.');
	});
});
