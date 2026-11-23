import React, {useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Check, ChevronDown, Search} from 'lucide-react';
import {useI18n} from './i18n.js';
import './select.css';

export default function Select({label, value, options, onChange, placeholder, disabled = false, editable = false, className = ''}) {
  const {language} = useI18n();
  const [position, setPosition] = useState(null);
  const [query, setQuery] = useState('');
  const [activeValue, setActiveValue] = useState();
  const root = useRef(null), trigger = useRef(null), popup = useRef(null), search = useRef(null);
  const listId = useId();
  const open = Boolean(position) && !disabled;
  const searchable = !editable && options.length > 5;
  const selected = options.find(option => option.value === value);
  const visible = options.filter(option => option.label.toLowerCase().includes(query.toLowerCase()));
  const enabled = visible.filter(option => !option.disabled);
  const active = enabled.find(option => option.value === activeValue) ?? (!editable ? enabled[0] : undefined);
  const optionId = option => listId + '-' + visible.indexOf(option);
  const activeId = open && active ? optionId(active) : undefined;
  const hint = placeholder ?? (language === 'zh' ? '请选择' : 'Select an option');
  const searchLabel = language === 'zh' ? '搜索选项' : 'Search options';

  function locate() {
    if (!root.current) return;
    const rect = root.current.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= window.innerHeight || !rect.width) {
      setPosition(null);
      return;
    }
    const width = Math.min(Math.max(200, rect.width), window.innerWidth - 16);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upward = below < 360 && above > below;
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
      maxHeight: upward ? above : below,
      ...(upward ? {bottom: window.innerHeight - rect.top + 4} : {top: rect.bottom + 4})
    });
  }

  function close(restoreFocus = false) {
    setPosition(null);
    if (restoreFocus) trigger.current?.focus({preventScroll: true});
  }

  function show() {
    if (disabled) return;
    setQuery('');
    setActiveValue(selected?.value);
    locate();
  }

  useEffect(() => {
    if (disabled) setPosition(null);
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open) return;
    search.current?.focus({preventScroll: true});
    function dismissOutside(event) {
      if (!root.current?.contains(event.target) && !popup.current?.contains(event.target)) close();
    }
    const observer = new ResizeObserver(locate);
    observer.observe(root.current);
    window.addEventListener('resize', locate);
    window.addEventListener('scroll', locate, true);
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', locate);
      window.removeEventListener('scroll', locate, true);
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
    };
  }, [open]);

  useLayoutEffect(() => {
    const option = activeId ? document.getElementById(activeId) : null;
    if (!option) return;
    const list = option.parentElement;
    const offset = option.getBoundingClientRect().top - list.getBoundingClientRect().top;
    if (offset < 0) list.scrollTop += offset;
    else if (offset + option.offsetHeight > list.clientHeight) list.scrollTop += offset + option.offsetHeight - list.clientHeight;
  }, [activeId]);

  function choose(option) {
    if (option && !option.disabled && !disabled) {
      onChange(option.value);
      close(true);
    }
  }

  function handleKey(event) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        show();
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      if (!enabled.length) return;
      const index = active ? enabled.indexOf(active) : step > 0 ? -1 : 0;
      setActiveValue(enabled[(index + step + enabled.length) % enabled.length].value);
    } else if (open && (event.key === 'Home' || event.key === 'End') && event.target === trigger.current && !editable) {
      event.preventDefault();
      setActiveValue((event.key === 'Home' ? enabled[0] : enabled.at(-1))?.value);
    } else if (open && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (open && event.key === 'Enter') {
      event.preventDefault();
      if (editable && !active) close();
      else choose(active);
    } else if (open && event.key === 'Tab') {
      close(search.current === event.target);
    } else if (open && event.key === ' ' && event.target === trigger.current && !editable) {
      event.preventDefault();
      choose(active);
    }
  }

  function updateQuery(next) {
    setQuery(next);
    setActiveValue(undefined);
  }

  const triggerProps = {
    ref: trigger, disabled, 'aria-label': label, 'aria-expanded': open,
    'aria-haspopup': 'listbox', 'aria-controls': open ? listId : undefined,
    'aria-activedescendant': activeId, onKeyDown: handleKey
  };
  const arrow = <ChevronDown size={20} className="quality-select-arrow" aria-hidden="true"/>;
  return <div ref={root} className={`quality-select ${className}`}>
    {editable ? <div className="quality-select-trigger" data-open={open} data-disabled={disabled}>
      <input {...triggerProps} role="combobox" aria-autocomplete="list" value={value} placeholder={hint}
        onClick={() => { if (!open) show(); }}
        onChange={event => { if (!open) show(); updateQuery(event.target.value); onChange(event.target.value); }}/>
      <button type="button" tabIndex={-1} disabled={disabled} aria-label={label}
        onMouseDown={event => event.preventDefault()}
        onClick={() => { trigger.current.focus(); if (open) close(); else show(); }}>{arrow}</button>
    </div> : <button {...triggerProps} role="combobox" type="button" className="quality-select-trigger"
      data-open={open} data-disabled={disabled} onClick={() => { if (open) close(); else show(); }}>
      <span className="quality-select-value">{selected?.label ?? hint}</span>{arrow}
    </button>}
    {open && createPortal(<div ref={popup} className="quality-select-popup" style={position}>
      {searchable && <label className="quality-select-search">
        <Search size={16} aria-hidden="true"/>
        <input ref={search} type="search" value={query} aria-label={searchLabel}
          placeholder={searchLabel} onChange={event => updateQuery(event.target.value)}
          onKeyDown={handleKey} role="combobox" aria-autocomplete="list"
          aria-expanded="true" aria-controls={listId} aria-activedescendant={activeId}/>
      </label>}
      <div id={listId} className="quality-select-options" role="listbox" aria-label={label}>
        {visible.map(option => <div key={option.value} id={optionId(option)} role="option"
          className="quality-select-option" aria-selected={option.value === value}
          aria-disabled={option.disabled || undefined} data-active={option === active}
          onPointerMove={event => { if (event.pointerType === 'mouse' && !option.disabled) setActiveValue(option.value); }}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>
          <span className="quality-select-value" title={option.label}>{option.label}</span>
          {option.value === value && <Check size={16} aria-hidden="true"/>}
        </div>)}
      </div>
      {visible.length === 0 && <div role="status" className="quality-select-empty">
        {language === 'zh' ? '没有匹配的选项' : 'No matching options'}
      </div>}
    </div>, document.body)}
  </div>;
}
