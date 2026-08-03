export function validateAgentDescriptor(descriptor) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(descriptor.slug))
        throw new Error(`Invalid agent slug: ${descriptor.slug}`);
    if (!descriptor.displayName.trim())
        throw new Error(`Agent ${descriptor.slug} has no display name`);
    if (descriptor.platforms.length === 0)
        throw new Error(`Agent ${descriptor.slug} has no supported platform`);
    if (descriptor.skills.length === 0)
        throw new Error(`Agent ${descriptor.slug} has no skill delivery capability`);
}
//# sourceMappingURL=agents.js.map