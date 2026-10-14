import { describe, expect, it } from 'vitest';

import { validateImageMimeType } from './download-image.js';

describe('validateImageMimeType', () => {
  describe('supported image extensions', () => {
    it.each([
      { extension: '.jpg', expectedMimeType: 'image/jpeg' },
      { extension: '.jpeg', expectedMimeType: 'image/jpeg' },
      { extension: '.jpe', expectedMimeType: 'image/jpeg' },
      { extension: '.jif', expectedMimeType: 'image/jpeg' },
      { extension: '.jfif', expectedMimeType: 'image/jpeg' },
      { extension: '.pjpeg', expectedMimeType: 'image/jpeg' },
      { extension: '.pjp', expectedMimeType: 'image/jpeg' },
      { extension: '.png', expectedMimeType: 'image/png' },
      { extension: '.gif', expectedMimeType: 'image/gif' },
      { extension: '.webp', expectedMimeType: 'image/webp' },
      { extension: '.avif', expectedMimeType: 'image/avif' },
      { extension: '.svg', expectedMimeType: 'image/svg+xml' },
    ])(
      'accepts $extension when the response MIME type matches',
      ({ extension, expectedMimeType }) => {
        const outputFilePath = `/downloads/artwork${extension}`;
        const response = new Response(null, {
          headers: {
            'content-type': `${expectedMimeType}; charset=UTF-8`,
          },
        });

        expect(() =>
          validateImageMimeType(response, outputFilePath),
        ).not.toThrow();
      },
    );

    it.each([
      { extension: '.JPG', expectedMimeType: 'image/jpeg' },
      { extension: '.JPEG', expectedMimeType: 'image/jpeg' },
      { extension: '.JpEg', expectedMimeType: 'image/jpeg' },
      { extension: '.PNG', expectedMimeType: 'image/png' },
      { extension: '.WebP', expectedMimeType: 'image/webp' },
      { extension: '.SVG', expectedMimeType: 'image/svg+xml' },
    ])(
      'accepts uppercase or mixed-case extension $extension',
      ({ extension, expectedMimeType }) => {
        const outputFilePath = `/downloads/artwork${extension}`;
        const response = new Response(null, {
          headers: {
            'content-type': expectedMimeType,
          },
        });

        expect(() =>
          validateImageMimeType(response, outputFilePath),
        ).not.toThrow();
      },
    );
  });

  describe('optional response headers and unknown extensions', () => {
    it('skips validation when the Content-Type header is missing', () => {
      const response = new Response(null);
      const outputFilePath = '/downloads/artwork.jpg';

      expect(() =>
        validateImageMimeType(response, outputFilePath),
      ).not.toThrow();
    });

    it('skips validation when the Content-Type header is empty', () => {
      const response = new Response(null, {
        headers: {
          'content-type': '',
        },
      });

      expect(() =>
        validateImageMimeType(response, '/downloads/artwork.jpg'),
      ).not.toThrow();
    });

    it.each([
      '/downloads/artwork',
      '/downloads/artwork.bin',
      '/downloads/artwork.pdf',
      '/downloads/artwork.unrecognized',
    ])(
      'skips MIME validation for an unsupported extension: %s',
      (outputFilePath) => {
        const response = new Response(null, {
          headers: {
            'content-type': 'image/png',
          },
        });

        expect(() =>
          validateImageMimeType(response, outputFilePath),
        ).not.toThrow();
      },
    );
  });

  describe('MIME type mismatch', () => {
    it('throws an error when the response MIME type differs from the expected type', () => {
      const outputFilePath = '/downloads/artwork.png';
      const response = new Response(null, {
        headers: {
          'content-type': 'IMAGE/JPEG ; charset=UTF-8',
        },
      });

      expect(() =>
        validateImageMimeType(response, outputFilePath),
      ).toThrow(
        'Image MIME type mismatch for "/downloads/artwork.png". ' +
        'Expected "image/png", but server responded with "image/jpeg".',
      );
    });
  });
});
