# Agent Instructions

## Release identification

Every change pushed to this repository must update the visible release identifier on the title screen.

The identifier must use this format:

`Version X.Y.Z · commit abcde`

Rules:

1. Increment the semantic version for every pushed update.
   - Patch: bug fix or small adjustment.
   - Minor: new user-visible feature.
   - Major: incompatible redesign.
2. Set the commit value to the first five characters of the functional source commit being released.
3. Update the cache-busting query strings for local CSS and JavaScript files to the same semantic version.
4. Keep the visible identifier near the main title so users can confirm which GitHub Pages build is loaded.
5. Because changing the displayed hash creates a new metadata commit, the hash may refer to the immediately preceding functional commit rather than the metadata-only version-label commit.
6. Never push a functional update without updating this identifier.
