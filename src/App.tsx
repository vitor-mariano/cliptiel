import { ChangeEvent, useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { useMachine } from "@xstate/react";
import { toast } from "sonner";
import { LoaderIcon } from "lucide-react";
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";
import { Label } from "./components/ui/label";
import { Transition, machine } from "./lib/state-machine";

interface Clip {
  start: number;
  end: number;
}

const MT_CORE_TIMEOUT = 3000;

function readFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", (event) => {
      resolve(event.target?.result as ArrayBuffer);
    });
    reader.readAsArrayBuffer(file);
  });
}

function App() {
  const [state, send] = useMachine(
    machine.provide({
      actions: {
        loadFFmpeg: ({ context }) => loadFFmpeg(context.multiThread),

        checkVideoInput() {
          if (fileRef.current) {
            send({ type: Transition.VIDEO_INPUT_SELECT });
          }
        },

        async detectSilence({ context }) {
          if (context.multiThread) {
            mtCoreTimeoutRef.current = setMtCoreTimeout();
          }

          const buffer = await readFile(fileRef.current!);
          await ffmpegRef.current.writeFile(
            "input.mp4",
            new Uint8Array(buffer)
          );

          await ffmpegRef.current.exec(
            [
              "-i",
              "input.mp4",
              "-af",
              "silencedetect=noise=-40dB:d=0.2",
              "-f",
              "null",
              "-",
            ],
            undefined,
            execController.current
          );

          if (mtCoreTimeoutRef.current) {
            clearTimeout(mtCoreTimeoutRef.current);
            mtCoreTimeoutRef.current = null;
          }

          fileRef.current = null;

          const [firstClip] = clipsRef.current;
          if (firstClip.start === 0 && firstClip.end === -1) {
            send({ type: Transition.CANCEL });
            return toast("No silent parts found.");
          }

          send({ type: Transition.RENDERING_PROCESS_VIDEO });
        },

        async processVideo() {
          const ffmpeg = ffmpegRef.current;

          await Promise.all([
            ...clipsRef.current.map((clip, index) =>
              ffmpeg.exec([
                "-i",
                "input.mp4",
                "-ss",
                clip.start.toString() + "ms",
                ...(clip.end === -1 ? [] : ["-to", clip.end.toString() + "ms"]),
                `clip-${index}.mp4`,
              ])
            ),
            ffmpeg.writeFile(
              "clips.txt",
              clipsRef.current
                .map((_clip, index) => `file clip-${index}.mp4`)
                .join("\n")
            ),
          ]);

          await Promise.all([
            ffmpeg.deleteFile("input.mp4"),
            ffmpeg.exec(["-f", "concat", "-i", "clips.txt", "output.mp4"]),
          ]);

          const data = await ffmpeg.readFile("output.mp4");
          setOutputVideoData(
            URL.createObjectURL(
              new Blob([new Uint8Array(data as ArrayBuffer).buffer], {
                type: "video/mp4",
              })
            )
          );

          await Promise.all([
            ...clipsRef.current.map((_clip, index) =>
              ffmpeg.deleteFile(`clip-${index}.mp4`)
            ),
            ffmpeg.deleteFile("clips.txt"),
            ffmpeg.deleteFile("output.mp4"),
          ]);

          clipsRef.current = [{ start: 0, end: -1 }];

          send({ type: Transition.RENDERING_FINISH });
        },
      },
    })
  );
  const ffmpegRef = useRef(new FFmpeg());
  const [outputVideoData, setOutputVideoData] = useState("");
  const fileRef = useRef<File | null>(null);
  const clipsRef = useRef<Clip[]>([{ start: 0, end: -1 }]);
  const mtCoreTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const execController = useRef(new AbortController());

  const done = state.matches("done");

  const setMtCoreTimeout = () =>
    setTimeout(() => {
      execController.current.abort();
      send({ type: Transition.RENDERING_MT_CORE_STUCK });
    }, MT_CORE_TIMEOUT);

  async function loadFFmpeg(multiThread = true) {
    const ffmpeg = ffmpegRef.current;

    if (ffmpeg.loaded) {
      ffmpeg.terminate();
    }

    const baseUrl = `https://unpkg.com/@ffmpeg/core${
      multiThread ? "-mt" : ""
    }@0.12.6/dist/esm`;

    ffmpeg.on("log", ({ message }) => {
      console.info(message);

      if (mtCoreTimeoutRef.current) {
        clearTimeout(mtCoreTimeoutRef.current);
        mtCoreTimeoutRef.current = setMtCoreTimeout();
      }

      if (message.includes("silence_start")) {
        const results = message.match(/silence_start: (\d+(?:.\d+)?)/);
        if (!results) return;

        const start = Math.round(parseFloat(results[1]) * 1000);

        if (start === 0) {
          return clipsRef.current.shift();
        }

        if (clipsRef.current[clipsRef.current.length - 1].end != start) {
          clipsRef.current[clipsRef.current.length - 1].end = start;
        }
      } else if (message.includes("silence_end")) {
        const results = message.match(/silence_end: (\d+(?:.\d+)?)/);
        if (!results) return;

        const end = Math.round(parseFloat(results[1]) * 1000);

        if (clipsRef.current[clipsRef.current.length - 1]?.start != end) {
          clipsRef.current.push({
            start: end,
            end: -1,
          });
        }
      }
    });

    // toBlobURL is used to bypass CORS issue, urls with the same
    // domain can be used directly.
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseUrl}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(
        `${baseUrl}/ffmpeg-core.wasm`,
        "application/wasm"
      ),
      ...(multiThread && {
        workerURL: await toBlobURL(
          `${baseUrl}/ffmpeg-core.worker.js`,
          "text/javascript"
        ),
      }),
    });

    send({ type: Transition.FFMPEG_READY });
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    fileRef.current = file;

    send({ type: Transition.VIDEO_INPUT_SELECT });
  }

  return (
    <div className="h-dvh flex">
      <div className="w-[400px] p-6 border-r">
        <h1 className="text-5xl font-bold mb-6">Cliptiel</h1>
        {done ? (
          <Button onClick={() => send({ type: Transition.RESTART })}>
            New video
          </Button>
        ) : (
          <Button
            onClick={() => send({ type: Transition.VIDEO_INPUT_RENDER })}
            disabled={!state.matches({ preparing: { videoInput: "selected" } })}
          >
            Render
          </Button>
        )}
      </div>
      <div className="flex-grow flex-col bg-background-secondary flex items-center justify-center p-6">
        {state.matches("preparing") && (
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="fileInput">Select a video</Label>
            <Input
              className="max-w-[300px]"
              type="file"
              name="fileInput"
              id="fileInput"
              accept="video/*"
              multiple={false}
              onChange={handleFile}
            />
          </div>
        )}
        {state.matches("rendering") && (
          <LoaderIcon className="w-16 h-16 animate-spin" />
        )}
        {done && (
          <video
            className="max-h-full max-w-full"
            controls
            src={outputVideoData!}
          />
        )}
      </div>
    </div>
  );
}

export default App;
