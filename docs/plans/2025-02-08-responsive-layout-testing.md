# Responsive Layout Testing Checklist

## Desktop (≥1024px)

- [ ] Three-column layout visible
- [ ] MessageList + Footer on left
- [ ] StatePanel on right
- [ ] Rules panel toggles correctly
- [ ] All interactions work

## Tablet (768-1023px)

- [ ] Bottom tab bar visible
- [ ] Tab switching works
- [ ] Active tab highlighted
- [ ] StatePanel takes full width
- [ ] Swipe gestures work between tabs
- [ ] Haptic feedback on tab change
- [ ] Footer only shows on messages tab

## Mobile (<768px)

- [ ] Single column layout
- [ ] MobileFooter shows observer message
- [ ] "Continue on desktop" button shows alert
- [ ] StatePanel visible below messages
- [ ] No interactive elements blocked

## Touch Targets

- [ ] All buttons ≥44×44px
- [ ] Tab items ≥56×56px
- [ ] Icon buttons ≥48×48px

## Gestures

- [ ] Pull-to-refresh works on tablet
- [ ] Swipe left/right switches tabs
- [ ] Double-tap zoom prevented
- [ ] Long-press context menu prevented (except inputs)

## iOS Safe Areas

- [ ] Content not hidden by notch
- [ ] Bottom tab bar above home indicator
- [ ] No horizontal scrolling
