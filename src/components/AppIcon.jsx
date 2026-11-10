const paths = {
  home: 'M3 11.5 12 4l9 7.5M5 10v10h14V10M9 20v-6h6v6',
  diary: 'M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2V5Zm4 4h8M8 13h8M8 17h5',
  brain: 'M9.5 4a3.5 3.5 0 0 0-3 5.1A3.5 3.5 0 0 0 6 16h3.5V4Zm5 0a3.5 3.5 0 0 1 3 5.1A3.5 3.5 0 0 1 18 16h-3.5V4ZM9.5 8H12m2.5 4H12M9.5 16v4m5-4v4',
  toolkit: 'M14.7 6.3a4 4 0 0 0-5 5L3.5 17.5a2.1 2.1 0 0 0 3 3l6.2-6.2a4 4 0 0 0 5-5l-3 3-3-3 3-3Z',
  chat: 'M4 4h16v12H8l-4 4V4Zm4 5h8M8 12h5',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  calendar: 'M3 5h18v16H3V5Zm0 5h18M8 3v4m8-4v4',
  resources: 'M5 3h14v18H5V3Zm4 5h6M9 12h6M9 16h4',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  diamond: 'm12 3 8 6-8 12-8-12 8-6Zm-8 6h16',
  logout: 'M10 4H4v16h6m4-4 4-4-4-4m4 4H9',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-4',
  analytics: 'M4 20V10m5 10V4m5 16v-7m5 7V7',
  broadcast: 'M3 11h3l10-5v12L6 13H3v-2Zm16-3a5 5 0 0 1 0 8',
  alert: 'M12 3 2 21h20L12 3Zm0 6v5m0 3v1',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8 0V12l-2-1.5V8l-3-1.5-2 1-2-1L8 8v2.5L6 12v3.5l2 1.5v2l3 1.5 2-1 2 1 3-1.5v-2l2-1.5Z',
  document: 'M6 2h9l3 3v17H6V2Zm9 0v4h4M9 11h6M9 15h6',
  building: 'M3 21h18V8l-9-5-9 5v13Zm6-13h6v13H9V8Zm3 4v8',
  medical: 'M12 21S4 16 4 9a4 4 0 0 1 7-2.65A4 4 0 0 1 18 9c0 7-6 12-6 12ZM12 7v8m-4-4h8',
  mail: 'M3 5h18v14H3V5Zm0 1 9 7 9-7',
  phone: 'M5 4h4l1.5 4.5-2.2 1.5a12 12 0 0 0 5.7 5.7l1.5-2.2L20 15v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'm6 6 12 12M18 6 6 18',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  flame: 'M12 22c4.4 0 7-2.8 7-6.5 0-3-2-5.5-3.5-7C14 7 13 5.5 13 3c-3 2-4.5 4.5-4.5 7 0 0-1.5-1-2-3-1 2-2.5 4-2.5 6.5C4 19.2 7.6 22 12 22Z',
  coin: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14v12M8 9.5c0-1.7 1.8-3 4-3s4 1.3 4 3-1.5 2.6-4 3-4 1.3-4 3 1.8 3 4 3 4-1.3 4-3',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  mic: 'M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8',
  check: 'm4 12.5 5 5L20 6.5',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14v6l4 2',
  heart: 'M12 21S3 14.5 3 8.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 9 2.8C21 14.5 12 21 12 21Z',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  star: 'm12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8L12 3Z',
  camera: 'M3 7h4l2-3h6l2 3h4v12H3V7Zm9 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
}

export default function AppIcon({ name, size = 18, strokeWidth = 1.8, ...props }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d={paths[name] || paths.chat} />
    </svg>
  )
}
