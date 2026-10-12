import { formatPrice, getPlatformColor, getScoreColor, truncateText } from './helpers';

test('formats normalized prices consistently', () => {
  expect(formatPrice(12.5)).toBe('$12.50');
  expect(formatPrice(undefined)).toBe('N/A');
});

test('maps scores and platforms to UI colors', () => {
  expect(getScoreColor(80)).toBe('#28a745');
  expect(getScoreColor(20)).toBe('#dc3545');
  expect(getPlatformColor('Amazon')).toBe('#ff9900');
});

test('truncates long text only when needed', () => {
  expect(truncateText('short', 10)).toBe('short');
  expect(truncateText('a longer title', 5)).toBe('a lon...');
});
