# Remotion Advanced Documentation

> Source: https://www.remotion.dev/docs
> Extracted: March 19, 2026

---

## Reusable Components & Sequences

React components allow encapsulating video logic and reusing the same visuals multiple times.

### Example: Reusable Title Component

```tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

const Title: React.FC<{title: string}> = ({title}) => {
  const frame = useCurrentFrame();
    const opacity = interpolate(frame, [0, 20], [0, 1], {
        extrapolateRight: 'clamp',
          });

            return (
                <div style={{opacity, textAlign: 'center', fontSize: '7em'}}>{title}</div>
                  );
                  };

                  export const MyVideo = () => {
                    return (
                        <AbsoluteFill>
                              <Title title="Hello World" />
                                  </AbsoluteFill>
                                    );
                                    };
                                    ```

                                    ### Using Sequences

                                    The `<Sequence>` component limits duration and time-shifts components:

                                    ```tsx
                                    import { Sequence } from 'remotion';

                                    export const MyVideo = () => {
                                      return (
                                          <AbsoluteFill>
                                                <Sequence durationInFrames={40}>
                                                        <Title title="Hello" />
                                                              </Sequence>
                                                                    <Sequence from={40}>
                                                                            <Title title="World" />
                                                                                  </Sequence>
                                                                                      </AbsoluteFill>
                                                                                        );
                                                                                        };
                                                                                        ```

                                                                                        - `useCurrentFrame()` is shifted in the second instance (returns 0 at absolute frame 40)
                                                                                        - Sequences are absolutely positioned by default
                                                                                        - Use `layout="none"` for regular div-like positioning

                                                                                        ---

                                                                                        ## Parameterized Videos

                                                                                        Remotion allows ingesting, validating, visually editing, and transforming data.

                                                                                        ### High-level Overview

                                                                                        Data flow: Default Props → Input Props → calculateMetadata() → Final Props → React Component

                                                                                        1. **Default props**: Defined statically for Studio design
                                                                                        2. **Input props**: Override default props at render time
                                                                                        3. **calculateMetadata()**: Post-process props, compute metadata asynchronously
                                                                                        4. **Final props**: Passed to React component

                                                                                        ### Topics
                                                                                        - Passing props: https://www.remotion.dev/docs/passing-props
                                                                                        - Defining a Schema: https://www.remotion.dev/docs/schemas
                                                                                        - Visual editing: https://www.remotion.dev/docs/visual-editing
                                                                                        - Data fetching: https://www.remotion.dev/docs/data-fetching
                                                                                        - Variable metadata: https://www.remotion.dev/docs/dynamic-metadata
                                                                                        - Props resolution: https://www.remotion.dev/docs/props-resolution

                                                                                        ---

                                                                                        ## Remotion Studio

                                                                                        ### Starting the Studio

                                                                                        ```bash
                                                                                        # Install CLI
                                                                                        npm i @remotion/cli

                                                                                        # Start Studio
                                                                                        npm run dev
                                                                                        # OR
                                                                                        npx remotion studio
                                                                                        ```

                                                                                        Studio starts on port 3000 (or higher if unavailable).

                                                                                        Features:
                                                                                        - Preview compositions
                                                                                        - Timeline navigation
                                                                                        - Render videos
                                                                                        - Edit default props visually
                                                                                        - Deploy as a server for team access

                                                                                        ### Deploying the Studio

                                                                                        Deploy Studio to a long-running server for non-technical team members: https://www.remotion.dev/docs/studio/deploy-server

                                                                                        ---

                                                                                        ## Audio in Remotion

                                                                                        Remotion provides powerful audio capabilities:

                                                                                        - **Importing audio**: Add audio to compositions
                                                                                        - **Delaying audio**: Delay start time of audio elements  
                                                                                        - **Creating audio from video**: Use audio from video files
                                                                                        - **Controlling volume**: Control volume of audio elements
                                                                                        - **Muting audio**: Mute audio elements
                                                                                        - **Controlling speed**: Change audio playback speed
                                                                                        - **Controlling pitch**: Change audio pitch
                                                                                        - **Visualizing audio**: Create audio visualizations
                                                                                        - **Exporting audio**: Export audio-only

                                                                                        See: https://www.remotion.dev/docs/using-audio

                                                                                        ---

                                                                                        ## GCP Cloud Run

                                                                                        **Status: Alpha / Experimental - Not actively developed**

                                                                                        Render Remotion videos on GCP Cloud Run.

                                                                                        ### Architecture
                                                                                        - **Cloud Run service**: Libraries + binaries for rendering
                                                                                        - **Cloud Storage bucket**: Projects, renders, metadata
                                                                                        - **CLI**: `npx remotion cloudrun`
                                                                                        - **Node.JS API**: Programmatic control

                                                                                        ### How It Works
                                                                                        1. Cloud Run service + Cloud Storage bucket created
                                                                                        2. Remotion project deployed to Cloud Storage
                                                                                        3. Service invoked, opens project
                                                                                        4. Renders video, uploads to Cloud Storage

                                                                                        ### Limits
                                                                                        - Max memory: 32GB
                                                                                        - Max vCPUs: 8
                                                                                        - Max filesystem: 32GB
                                                                                        - Max timeout: 60 minutes

                                                                                        ### Supported GCP Regions
                                                                                        asia-east1, asia-east2, asia-northeast1, asia-northeast2, asia-northeast3, asia-south1, asia-south2, asia-southeast1, asia-southeast2, australia-southeast1, australia-southeast2, europe-central2, europe-north1, europe-southwest1, europe-west1-9, me-west1, northamerica-northeast1-2, southamerica-east1, southamerica-west1, us-central1, us-east1/4/5, us-south1, us-west1-4

                                                                                        ---

                                                                                        ## Terminology Reference

                                                                                        | Term | Meaning |
                                                                                        |------|---------|
                                                                                        | Composition | React component + video metadata (fps, duration, dimensions) |
                                                                                        | Sequence | A component that time-shifts its children |
                                                                                        | Composition ID | Unique string identifier for a composition |
                                                                                        | Bundle | Webpack bundle of Remotion project for rendering |
                                                                                        | Serve URL | URL to access Remotion bundle for rendering |
                                                                                        | Public Dir | `public/` folder accessible via `staticFile()` |
                                                                                        | Remotion Root | Entry point file (Root.tsx) registering all compositions |
                                                                                        | Entry point | File passed to CLI/API pointing to Remotion Root |
                                                                                        | Remotion Studio | Browser-based preview and render tool |
                                                                                        | Remotion Preview | Old name for Remotion Studio |
                                                                                        | Remotion Player | `<Player>` component for embedding in React apps |
                                                                                        | Concurrency | Number of parallel rendering processes |
                                                                                        | Input props | Props passed to override default props at render time |
                                                                                        | Cloud Run URL | URL of a Cloud Run service |
                                                                                        | Service Name | Identifier of a Cloud Run service |

                                                                                        ---

                                                                                        ## Resources & Ecosystem

                                                                                        ### Official Integrations
                                                                                        - React Three Fiber (3D): https://www.remotion.dev/docs/three
                                                                                        - React Native Skia: https://www.remotion.dev/docs/skia
                                                                                        - Google Fonts: https://www.remotion.dev/docs/google-fonts
                                                                                        - Figma: https://www.remotion.dev/docs/figma
                                                                                        - Lottie Animations: https://www.remotion.dev/docs/lottie
                                                                                        - Spline 3D: https://www.remotion.dev/docs/spline
                                                                                        - After Effects: https://www.remotion.dev/docs/after-effects
                                                                                        - Rive Animations: https://www.remotion.dev/docs/rive
                                                                                        - GIFs: https://www.remotion.dev/docs/gif

                                                                                        ### Effects
                                                                                        - Motion Blur: https://www.remotion.dev/docs/motion-blur
                                                                                        - Noise: https://www.remotion.dev/docs/noise
                                                                                        - Path Animations: https://www.remotion.dev/docs/paths

                                                                                        ### Community Templates
                                                                                        - Hello World (TypeScript): https://github.com/remotion-dev/template-helloworld
                                                                                        - React Three Fiber: https://github.com/remotion-dev/template-three
                                                                                        - Stills: https://github.com/remotion-dev/template-still
                                                                                        - Audiogram: https://github.com/remotion-dev/template-audiogram
                                                                                        - Music Visualization: https://github.com/remotion-dev/template-music-visualization

                                                                                        ### Animation Helpers
                                                                                        - Remotion Animated: https://www.remotion-animated.dev/
                                                                                        - Timing Editor: https://www.remotion.dev/timing-editor

                                                                                        ### Full Projects
                                                                                        - GitHub Unwrapped 2023/2024: https://github.com/remotion-dev/github-unwrapped
                                                                                        - Podcast Maker: https://github.com/FelippeChemello/podcast-maker

                                                                                        ### Products Built with Remotion
                                                                                        - Typeframes: https://www.typeframes.com
                                                                                        - ClipPulse: https://www.clippulse.com
                                                                                        - Augie: https://www.meetaugie.com
                                                                                        - Hackreels: https://www.hackreels.com
                                                                                        - AnimStats: https://www.animstats.com

                                                                                        ### Tutorials
                                                                                        - Spotify Wrapped 2020/2025 (YouTube)
                                                                                        - Programmatic Stories (YouTube)
                                                                                        - Basketball Tracker (YouTube)
                                                                                        - Formula 1 Graphics (YouTube)
                                                                                        - Fireship Remotion Tutorial (YouTube)

                                                                                        ---

                                                                                        ## CLI Reference

                                                                                        ### Main Commands

                                                                                        ```bash
                                                                                        # Create new project
                                                                                        npx create-video@latest

                                                                                        # Start Studio
                                                                                        npx remotion studio

                                                                                        # Render video
                                                                                        npx remotion render <composition-id> [output-path]

                                                                                        # Lambda commands
                                                                                        npx remotion lambda

                                                                                        # Cloud Run commands  
                                                                                        npx remotion cloudrun

                                                                                        # Bundle
                                                                                        npx remotion bundle
                                                                                        ```

                                                                                        ### Render Options
                                                                                        - `--props` - Pass JSON props file
                                                                                        - `--sequence` - Output image sequence
                                                                                        - `--codec` - Set output codec
                                                                                        - `--quality` - Set output quality
                                                                                        - `--frames` - Specify frame range
                                                                                        - `--concurrency` - Set parallel rendering
                                                                                        - `--timeout` - Set render timeout

                                                                                        ---

                                                                                        ## Captions / Subtitles

                                                                                        ### @remotion/captions

                                                                                        ```bash
                                                                                        npm i @remotion/captions
                                                                                        ```

                                                                                        Functions:
                                                                                        - `parseSrt(content)` - Parse .srt subtitle file
                                                                                        - `serializeSrt(captions)` - Convert captions to .srt
                                                                                        - `createTikTokStyleCaptions(captions)` - Structure for TikTok display

                                                                                        Caption shape:
                                                                                        ```ts
                                                                                        type Caption = {
                                                                                          text: string;
                                                                                            startMs: number;
                                                                                              endMs: number;
                                                                                                timestampMs: number | null;
                                                                                                  confidence: number | null;
                                                                                                  }
                                                                                                  ```

                                                                                                  ### @remotion/install-whisper-cpp

                                                                                                  AI-powered transcription:

                                                                                                  ```bash
                                                                                                  npm i @remotion/install-whisper-cpp
                                                                                                  ```

                                                                                                  ```ts
                                                                                                  import { installWhisperCpp, downloadWhisperModel, transcribe, toCaptions } from '@remotion/install-whisper-cpp';

                                                                                                  // Install whisper.cpp
                                                                                                  await installWhisperCpp({ to: './whisper.cpp', version: '1.5.5' });

                                                                                                  // Download model
                                                                                                  await downloadWhisperModel({ model: 'medium', folder: './whisper.cpp' });

                                                                                                  // Transcribe
                                                                                                  const { transcription } = await transcribe({
                                                                                                    inputPath: './audio.mp3',
                                                                                                      whisperPath: './whisper.cpp',
                                                                                                        model: 'medium',
                                                                                                          tokenLevelTimestamps: true,
                                                                                                          });
                                                                                                          
                                                                                                          // Convert to captions
                                                                                                          const captions = toCaptions({ transcription });
                                                                                                          ```
                                                                                                          
                                                                                                          ---
                                                                                                          
                                                                                                          ## Media Parser (@remotion/media-parser)
                                                                                                          
                                                                                                          Pure JavaScript library for parsing video files without ffmpeg:
                                                                                                          
                                                                                                          ```bash
                                                                                                          npm i @remotion/media-parser
                                                                                                          ```
                                                                                                          
                                                                                                          ```ts
                                                                                                          import { parseMedia } from '@remotion/media-parser';
                                                                                                          
                                                                                                          const result = await parseMedia({
                                                                                                            src: 'https://example.com/video.mp4',
                                                                                                              fields: { 
                                                                                                                  durationInSeconds: true, 
                                                                                                                      dimensions: true,
                                                                                                                          tracks: true,
                                                                                                                            },
                                                                                                                            });
                                                                                                                            ```
                                                                                                                            
                                                                                                                            Functions:
                                                                                                                            - `parseMedia()` - Parse media file metadata
                                                                                                                            - `downloadAndParseMedia()` - Download and parse
                                                                                                                            - `parseMediaOnWebWorker()` - Parse in browser Web Worker
                                                                                                                            - `parseMediaOnServerWorker()` - Parse on server worker
                                                                                                                            - `mediaParserController()` - Pause/resume/abort
                                                                                                                            
                                                                                                                            ---
                                                                                                                            
                                                                                                                            ## WebCodecs (@remotion/webcodecs)
                                                                                                                            
                                                                                                                            Convert media using WebCodecs API:
                                                                                                                            
                                                                                                                            ```bash
                                                                                                                            npm i @remotion/webcodecs
                                                                                                                            ```
                                                                                                                            
                                                                                                                            ```ts
                                                                                                                            import { convertMedia } from '@remotion/webcodecs';
                                                                                                                            
                                                                                                                            await convertMedia({
                                                                                                                              src: 'video.mp4',
                                                                                                                                container: 'webm',
                                                                                                                                  videoCodec: 'vp8',
                                                                                                                                    audioCodec: 'opus',
                                                                                                                                    });
                                                                                                                                    ```
                                                                                                                                    
                                                                                                                                    Functions:
                                                                                                                                    - `convertMedia()` - Convert video format
                                                                                                                                    - `extractFrames()` - Extract frames at timestamps
                                                                                                                                    - `canReencodeVideoTrack()` / `canReencodeAudioTrack()`
                                                                                                                                    - `canCopyVideoTrack()` / `canCopyAudioTrack()`
                                                                                                                                    - `getAvailableContainers()` - List supported containers
                                                                                                                                    - `getAvailableVideoCodecs()` / `getAvailableAudioCodecs()`
                                                                                                                                    
                                                                                                                                    ---
                                                                                                                                    
                                                                                                                                    ## Vercel Integration (@remotion/vercel)
                                                                                                                                    
                                                                                                                                    Render videos on Vercel Sandbox:
                                                                                                                                    
                                                                                                                                    ```bash
                                                                                                                                    npm i @remotion/vercel
                                                                                                                                    ```
                                                                                                                                    
                                                                                                                                    ```ts
                                                                                                                                    import { createSandbox, renderMediaOnVercel, uploadToVercelBlob } from '@remotion/vercel';
                                                                                                                                    
                                                                                                                                    const sandbox = await createSandbox();
                                                                                                                                    const { outputUrl } = await renderMediaOnVercel({
                                                                                                                                      sandbox,
                                                                                                                                        serveUrl: 'https://my-remotion-site.vercel.app',
                                                                                                                                          composition: 'MyComposition',
                                                                                                                                            inputProps: { title: 'Hello World' },
                                                                                                                                            });
                                                                                                                                            ```
                                                                                                                                            
                                                                                                                                            ---
                                                                                                                                            
                                                                                                                                            ## Studio API (@remotion/studio)
                                                                                                                                            
                                                                                                                                            Control the Remotion Studio programmatically:
                                                                                                                                            
                                                                                                                                            ```bash
                                                                                                                                            npm i @remotion/studio
                                                                                                                                            ```
                                                                                                                                            
                                                                                                                                            Functions:
                                                                                                                                            - `getStaticFiles()` - List files in public folder
                                                                                                                                            - `writeStaticFile({ filePath, contents })` - Save file
                                                                                                                                            - `deleteStaticFile({ filePath })` - Delete file  
                                                                                                                                            - `watchPublicFolder(cb)` - Listen to public folder changes
                                                                                                                                            - `play()` / `pause()` / `toggle()` - Timeline playback
                                                                                                                                            - `seek(frame)` - Jump to frame
                                                                                                                                            - `goToComposition(compositionId)` - Select composition
                                                                                                                                            - `visualControl(name, config)` - Add Studio sidebar control
                                                                                                                                            - `saveDefaultProps()` - Save default props
                                                                                                                                            - `updateDefaultProps()` - Update props editor
                                                                                                                                            - `reevaluateComposition()` - Re-run calculateMetadata()
                                                                                                                                            
                                                                                                                                            ---
                                                                                                                                            
                                                                                                                                            ## SVG Paths (@remotion/paths)
                                                                                                                                            
                                                                                                                                            Manipulate and animate SVG paths:
                                                                                                                                            
                                                                                                                                            ```bash
                                                                                                                                            npm i @remotion/paths
                                                                                                                                            ```
                                                                                                                                            
                                                                                                                                            Key functions:
                                                                                                                                            - `getLength(path)` - Get path total length
                                                                                                                                            - `cutPath(path, length)` - Cut path at length (for drawing animations)
                                                                                                                                            - `getPointAtLength(path, length)` - Get x,y at position
                                                                                                                                            - `evolvePath(progress, path)` - Animate path from 0 to 1
                                                                                                                                            - `interpolatePath(progress, pathA, pathB)` - Morph between paths
                                                                                                                                            - `translatePath(path, x, y)` - Move path position
                                                                                                                                            - `scalePath(path, scale)` - Scale path
                                                                                                                                            - `reversePath(path)` - Reverse path direction
                                                                                                                                            - `normalizePath(path)` - Use absolute coordinates
                                                                                                                                            - `getBoundingBox(path)` - Get bounding box
                                                                                                                                            
                                                                                                                                            Example - Drawing animation:
                                                                                                                                            ```tsx
                                                                                                                                            const { evolvePath } = require('@remotion/paths');
                                                                                                                                            
                                                                                                                                            const progress = interpolate(frame, [0, 60], [0, 1]);
                                                                                                                                            const { strokeDasharray, strokeDashoffset } = evolvePath(progress, svgPath);
                                                                                                                                            ```
                                                                                                                                            
                                                                                                                                            ---
                                                                                                                                            
                                                                                                                                            ## Noise Effects (@remotion/noise)
                                                                                                                                            
                                                                                                                                            Perlin noise for organic animations:
                                                                                                                                            
                                                                                                                                            ```bash
                                                                                                                                            npm i @remotion/noise
                                                                                                                                            ```
                                                                                                                                            
                                                                                                                                            ```tsx
                                                                                                                                            import { noise2D, noise3D } from '@remotion/noise';
                                                                                                                                            
                                                                                                                                            // 2D noise (good for spatial effects)
                                                                                                                                            const value = noise2D('seed', x / 100, y / 100);
                                                                                                                                            
                                                                                                                                            // 3D noise (good for animated effects - use frame as z)
                                                                                                                                            const value = noise3D('seed', x / 100, y / 100, frame / 50);
                                                                                                                                            // Returns value between -1 and 1
                                                                                                                                            ```
                                                                                                                                            
                                                                                                                                            ---
                                                                                                                                            
                                                                                                                                            ## SVG Shapes (@remotion/shapes)
                                                                                                                                            
                                                                                                                                            Generate SVG paths for common shapes:
                                                                                                                                            
                                                                                                                                            ```bash
                                                                                                                                            npm i @remotion/shapes
                                                                                                                                            ```
                                                                                                                                            
                                                                                                                                            Available shapes: Arrow, Rect, Circle, Heart, Pie, Ellipse, Triangle, Star, Polygon
                                                                                                                                            
                                                                                                                                            ```tsx
                                                                                                                                            import { makeCircle, Circle } from '@remotion/shapes';
                                                                                                                                            
                                                                                                                                            // Get path string
                                                                                                                                            const { path } = makeCircle({ radius: 100 });
                                                                                                                                            
                                                                                                                                            // Or use component
                                                                                                                                            <Circle radius={100} fill="blue" />
                                                                                                                                            ```
                                                                                                                                            
                                                                                                                                            ---
                                                                                                                                            
                                                                                                                                            ## Transitions (@remotion/transitions)
                                                                                                                                            
                                                                                                                                            Animate between scenes:
                                                                                                                                            
                                                                                                                                            ```bash
                                                                                                                                            npm i @remotion/transitions
                                                                                                                                            ```
                                                                                                                                            
                                                                                                                                            ```tsx
                                                                                                                                            import { TransitionSeries, springTiming } from '@remotion/transitions';
                                                                                                                                            import { fade } from '@remotion/transitions/fade';
                                                                                                                                            
                                                                                                                                            <TransitionSeries>
                                                                                                                                              <TransitionSeries.Sequence durationInFrames={60}>
                                                                                                                                                  <SceneA />
                                                                                                                                                    </TransitionSeries.Sequence>
                                                                                                                                                      <TransitionSeries.Transition
                                                                                                                                                          presentation={fade()}
                                                                                                                                                              timing={springTiming({ config: { damping: 200 } })}
                                                                                                                                                                />
                                                                                                                                                                  <TransitionSeries.Sequence durationInFrames={60}>
                                                                                                                                                                      <SceneB />
                                                                                                                                                                        </TransitionSeries.Sequence>
                                                                                                                                                                        </TransitionSeries>
                                                                                                                                                                        ```
                                                                                                                                                                        
                                                                                                                                                                        Available presentations:
                                                                                                                                                                        - `fade()` - Opacity transition
                                                                                                                                                                        - `slide()` - Slide in/out
                                                                                                                                                                        - `wipe()` - Wipe effect
                                                                                                                                                                        - `flip()` - 3D flip rotation
                                                                                                                                                                        - `clockWipe()` - Circular reveal
                                                                                                                                                                        - `iris()` - Circular mask from center
                                                                                                                                                                        - `cube()` [Paid] - 3D cube rotation
                                                                                                                                                                        - `none()` - No visual effect
                                                                                                                                                                        
                                                                                                                                                                        Available timings:
                                                                                                                                                                        - `springTiming({ config })` - Physics-based
                                                                                                                                                                        - `linearTiming({ durationInFrames, easing })` - Linear with optional easing
                                                                                                                                                                        
                                                                                                                                                                        ---
                                                                                                                                                                        
                                                                                                                                                                        ## Motion Blur (@remotion/motion-blur)
                                                                                                                                                                        
                                                                                                                                                                        ```bash
                                                                                                                                                                        npm i @remotion/motion-blur
                                                                                                                                                                        ```
                                                                                                                                                                        
                                                                                                                                                                        ```tsx
                                                                                                                                                                        import { Trail, CameraMotionBlur } from '@remotion/motion-blur';
                                                                                                                                                                        
                                                                                                                                                                        // Trail effect - ghost images following motion
                                                                                                                                                                        <Trail layers={3} lagInFrames={2} decay={0.9}>
                                                                                                                                                                          <MovingElement />
                                                                                                                                                                          </Trail>
                                                                                                                                                                          
                                                                                                                                                                          // Camera motion blur - natural camera blur
                                                                                                                                                                          <CameraMotionBlur shutterAngle={180} samples={10}>
                                                                                                                                                                            <Scene />
                                                                                                                                                                            </CameraMotionBlur>
                                                                                                                                                                            ```
                                                                                                                                                                            
                                                                                                                                                                            ---
                                                                                                                                                                            
                                                                                                                                                                            ## Zod Types (@remotion/zod-types)
                                                                                                                                                                            
                                                                                                                                                                            Enable Remotion Studio UI for custom types:
                                                                                                                                                                            
                                                                                                                                                                            ```bash
                                                                                                                                                                            npm i @remotion/zod-types
                                                                                                                                                                            ```
                                                                                                                                                                            
                                                                                                                                                                            ```tsx
                                                                                                                                                                            import { zColor, zTextarea, zMatrix } from '@remotion/zod-types';
                                                                                                                                                                            import { z } from 'zod';
                                                                                                                                                                            
                                                                                                                                                                            const schema = z.object({
                                                                                                                                                                              title: z.string(),
                                                                                                                                                                                color: zColor(),
                                                                                                                                                                                  description: zTextarea(),
                                                                                                                                                                                    transform: zMatrix(),
                                                                                                                                                                                    });
                                                                                                                                                                                    ```
                                                                                                                                                                                    
                                                                                                                                                                                    ---
                                                                                                                                                                                    
                                                                                                                                                                                    ## Licensing
                                                                                                                                                                                    
                                                                                                                                                                                    ### Open Source License
                                                                                                                                                                                    Standard Remotion license: https://github.com/remotion-dev/remotion/blob/main/LICENSE.md
                                                                                                                                                                                    
                                                                                                                                                                                    ### Commercial Use
                                                                                                                                                                                    - Free for individuals and teams of up to 3 people
                                                                                                                                                                                    - Company License required for 4+ people
                                                                                                                                                                                    - Cloud Rendering requires license setup via https://remotion.pro/license
                                                                                                                                                                                    
                                                                                                                                                                                    ### Cloud Rendering Units
                                                                                                                                                                                    Companies using cloud rendering must set up Cloud Rendering Units at https://remotion.pro/license
                                                                                                                                                                                    
                                                                                                                                                                                    ---
                                                                                                                                                                                    
                                                                                                                                                                                    ## Support & Community
                                                                                                                                                                                    
                                                                                                                                                                                    - Discord: https://remotion.dev/discord (6000+ members)
                                                                                                                                                                                    - GitHub Issues: https://github.com/remotion-dev/remotion/issues
                                                                                                                                                                                    - Support page: https://www.remotion.dev/docs/support
                                                                                                                                                                                    - Experts for hire: https://www.remotion.dev/experts
                                                                                                                                                                                    - Success Stories: https://www.remotion.dev/success-stories
                                                                                                                                                                                    
                                                                                                                                                                                    ---
                                                                                                                                                                                    
                                                                                                                                                                                    ## Additional Pages
                                                                                                                                                                                    
                                                                                                                                                                                    | Page | URL |
                                                                                                                                                                                    |------|-----|
                                                                                                                                                                                    | Captions (overview) | https://www.remotion.dev/docs/captions/ |
                                                                                                                                                                                    | Client-side rendering | https://www.remotion.dev/docs/client-side-rendering/ |
                                                                                                                                                                                    | AI / Claude Code | https://www.remotion.dev/docs/ai/ |
                                                                                                                                                                                    | Media Bunny | https://www.remotion.dev/docs/mediabunny/ |
                                                                                                                                                                                    | Config file | https://www.remotion.dev/docs/config |
                                                                                                                                                                                    | CLI reference | https://www.remotion.dev/docs/cli/ |
                                                                                                                                                                                    | Remotion package | https://www.remotion.dev/docs/remotion |
                                                                                                                                                                                    | Animated Emoji | https://www.remotion.dev/docs/animated-emoji/ |
                                                                                                                                                                                    | Animation Utils | https://www.remotion.dev/docs/animation-utils/ |
                                                                                                                                                                                    | Bundler | https://www.remotion.dev/docs/bundler |
                                                                                                                                                                                    | SCSS support | https://www.remotion.dev/docs/enable-scss/overview |
                                                                                                                                                                                    | Fonts API | https://www.remotion.dev/docs/fonts-api/ |
                                                                                                                                                                                    | GIF | https://www.remotion.dev/docs/gif/ |
                                                                                                                                                                                    | Google Fonts | https://www.remotion.dev/docs/google-fonts/ |
                                                                                                                                                                                    | Layout Utils | https://www.remotion.dev/docs/layout-utils/ |
                                                                                                                                                                                    | Licensing | https://www.remotion.dev/docs/licensing/ |
                                                                                                                                                                                    | Media Utils | https://www.remotion.dev/docs/media-utils/ |
                                                                                                                                                                                    | Player (full) | https://www.remotion.dev/docs/player/ |
                                                                                                                                                                                    | Preload | https://www.remotion.dev/docs/preload/ |
                                                                                                                                                                                    | Renderer | https://www.remotion.dev/docs/renderer |
                                                                                                                                                                                    | Rive | https://www.remotion.dev/docs/rive/ |
                                                                                                                                                                                    | Skia | https://www.remotion.dev/docs/skia/ |
                                                                                                                                                                                    | Spline | https://www.remotion.dev/docs/spline/ |
                                                                                                                                                                                    | Three.js | https://www.remotion.dev/docs/three/ |
                                                                                                                                                                                    | Tailwind v3 | https://www.remotion.dev/docs/tailwind/ |
                                                                                                                                                                                    | Tailwind v4 | https://www.remotion.dev/docs/tailwind-v4/ |
