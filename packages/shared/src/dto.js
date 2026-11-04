"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_LINK_SCHEMES = exports.LINK_CATEGORIES = void 0;
exports.LINK_CATEGORIES = [
    { category: 'linkedin', label: 'LinkedIn', defaultIcon: 'linkedin' },
    { category: 'github', label: 'GitHub', defaultIcon: 'github' },
    { category: 'portfolio', label: 'Portfolio', defaultIcon: 'globe' },
    { category: 'email', label: 'Email', defaultIcon: 'mail' },
    { category: 'calendar', label: 'Calendar', defaultIcon: 'calendar' },
    { category: 'company', label: 'Company Site', defaultIcon: 'building' },
    { category: 'instagram', label: 'Instagram', defaultIcon: 'instagram' },
    { category: 'facebook', label: 'Facebook', defaultIcon: 'facebook' },
    { category: 'twitter', label: 'X / Twitter', defaultIcon: 'twitter' },
    { category: 'gaming', label: 'Gaming', defaultIcon: 'gamepad' },
    { category: 'messaging', label: 'Messaging', defaultIcon: 'message-circle' },
    { category: 'spotify', label: 'Spotify', defaultIcon: 'music' },
    { category: 'custom', label: 'Custom', defaultIcon: 'link' },
];
/** Allowed URL schemes for profile links (Requirement 3.2). */
exports.ALLOWED_LINK_SCHEMES = ['https:', 'http:', 'mailto:', 'tel:'];
//# sourceMappingURL=dto.js.map