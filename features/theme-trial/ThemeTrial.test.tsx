import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ThemeTrial } from './ThemeTrial';
import { THEME_BOOT_SCRIPT, THEME_STORAGE_KEY, isThemeId } from './themes';

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('ThemeTrial', () => {
  it('switches the theme on <html> and remembers it', () => {
    render(<ThemeTrial />);
    const select = screen.getByLabelText('Theme');
    expect(select).toHaveValue('charcoal');

    fireEvent.change(select, { target: { value: 'navy' } });
    expect(document.documentElement.dataset.theme).toBe('navy');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('navy');

    fireEvent.change(select, { target: { value: 'charcoal' } });
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('starts on the saved theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'logo-flame');
    render(<ThemeTrial />);
    expect(screen.getByLabelText('Theme')).toHaveValue('logo-flame');
  });
});

describe('THEME_BOOT_SCRIPT', () => {
  it('applies a saved non-default theme and ignores junk', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'slate');
    new Function(THEME_BOOT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe('slate');

    delete document.documentElement.dataset.theme;
    localStorage.setItem(THEME_STORAGE_KEY, 'nope');
    new Function(THEME_BOOT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(isThemeId('nope')).toBe(false);
  });
});
