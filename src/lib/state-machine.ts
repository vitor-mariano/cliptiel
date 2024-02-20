import { assign, setup } from "xstate";

export const Transition = {
  FFMPEG_READY: "ffmpeg.ready",
  VIDEO_INPUT_SELECT: "videoInput.select",
  VIDEO_INPUT_RENDER: "videoInput.render",
  START_RENDERING: "startRendering",
  RENDERING_MT_CORE_STUCK: "rendering.mtCoreStuck",
  RENDERING_ST_CORE_LOADED: "rendering.stCoreLoaded",
  RENDERING_PROCESS_VIDEO: "rendering.processVideo",
  RENDERING_FINISH: "rendering.finish",
  RESTART: "restart",
  CANCEL: "cancel",
} as const;

export type Transition = (typeof Transition)[keyof typeof Transition];

export const machine = setup({
  types: {
    events: {} as { type: Transition },
    context: {} as {
      multiThread: boolean;
    },
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QDcCWEwHsCiFUBdMAnAOgAciwyBDI1AOygGIJN6wTZ9r8O0MceQqQpVaDKAG0ADAF1EoMplgFUbBSAAeiAIwAmaSQAsAdhMBWABzS9RgMx6TOk3oA0IAJ6IAbDp0lLAE5nEMdvSzsTAF8o934sXAJickoaOkYSAFt8AGFiDgAbTGo8RiYAM3LMsjAoEkoSjxl5JBAlFXw1eg1tBABac28SQOkdb289QIMdO0HZ9y8EA0MJv3GjSwNzO0DzGLj0BKFk0TSJEnjMAEl6MgBXfBJ0ArAmS5v7x9gwF4BjfGaGnaqnUrV6ejslhILnM0m8ZksRh0o3hC10ExIVki0ic0ksJnGNn2IEuiWEKTE6Tq71uD04PzA-0gb0O11pj0o9AwREBrWBnVBoHBdiGeksviCjis3jsIrRSxGJHhEMllk29kCxNJx1InO5EhYbA4XB4fFZZOSerAVN5imUIO6YMQjn8enMgRl7sC3u8Vnl3mCJAM3ukRiszmkgUsWvNOvqYC51oNv2o9F+P1tbXtAsdQsQfTdAWcnqR+h0gyMRn9yJIOzG8J27qMgSMMYEFt1Cf1GQwvH+EgAyqgXmnXlaqVlcvkB-g7r8ANaZ-ldHq6fEkPyy6TmHTWHfSPHyj12aHeewRXxTcwbNtHJKdxMT3uMzqMIcj9NMcfnCiYdOwWAADVWSXbMVydfpxhIHED0hCZBjPXd5WRSxzACN1zFhTYrEcaNYhJWN73jR8fyIP84BURhgIEL8uyTDJygYVBYAAC1AjpwLzBAdF2YZTBwzYHErcZkOcE9d3rSN7GkEVb0EIjvwyIoSkHKdKAqKoajqBoICaOQgTAwUtHzOwjExSJZTsZFAhFJw7HlVC9GgmSRVmbCWz2fDtSI1h2Fok0iABfS+UM3NjKWJwAiRUyeL0cJtzheVryc4IJlMAkRgiGJ8PoTAMHgVpvOEAyOKM3oC2cYwjBkwITCMXxqpktxPHzPRKvLAwrLdGZMJkuSOwpM5GBKh1V36MZAiqmq6oa2DmsWPp9Em31Or8cw9DikVPIOds41OcQMmyPJKBGnMxsWtqpp2GadEahwHOhAkTEheqbBcSM9H6vbUgOuojvyEhlNKKBTs48K+meq7avq265qPUUnsw30D3W0yvqI-aJ3+ygSF8sBQbKkyTExW6ZVGYI2v0Sx5TioZ1o6yIXDMct0fJTHzhpT4CbC3oxjQ+FNg2qzxWbQJ5T6IwnI6mTkW2ZwNuiLzCLZn6J05ulnnxkLSp550ZiVExBYhXcz29eUw1rUwPRGMNgmCFmld2jHVY51kPjpb4-l4CBubGxxDFmHY1RcFtTPm51HGGX0Rn9tVrx0VmThdjJ1cePHfYg2mAjPBxDYicw6rGeURScpsXHxL1BhxROH27EHtdGiDFtu6CTFg8U3XWJCWoQAkzLhZLkW3SntoIp3yUUupn37N9hwTdMM64iXiYPGSwzqsNEQseGT1sSM7FXnEQ5r4i65SciAIkaisEX8LdyhSX7BMWrYMwnRkLhJyHEw6x782E-J6A2KMDGcx0tZ2h1mNHiaFn7JTFN6fEz97I91Qv4QYg9kTSUmAAuiT4jS33KmZfE25yxBHhG3Z+olIo2TGLdMwthnp2BPunBuZ1M7WA3HCD0AY4p7nfj3XwAdgjPQLlYNusxspRCAA */
  id: "videoEditor",
  initial: "preparing",
  context: {
    multiThread: true,
  },
  states: {
    preparing: {
      states: {
        mtCore: {
          initial: "loading",
          states: {
            loading: {
              entry: ["loadFFmpeg"],
              on: {
                "ffmpeg.ready": {
                  target: "done",
                },
              },
            },
            done: {
              type: "final",
            },
          },
        },
        videoInput: {
          initial: "idle",
          states: {
            idle: {
              entry: ["checkVideoInput"],
              on: {
                "videoInput.select": "selected",
              },
            },

            selected: {
              on: {
                "videoInput.render": "done",
              },
            },

            done: {
              type: "final",
            },
          },
        },
      },
      type: "parallel",
      onDone: {
        target: "rendering",
      },
    },

    rendering: {
      initial: "detectingSilence",

      states: {
        detectingSilence: {
          entry: ["detectSilence"],
          on: {
            "rendering.mtCoreStuck": {
              target: "loadingStCore",
              actions: assign({
                multiThread: false,
              }),
            },
            "rendering.processVideo": "processingVideo",
          },
        },

        processingVideo: {
          entry: ["processVideo"],
          on: {
            "rendering.finish": {
              target: "done",
            },
          },
        },

        loadingStCore: {
          entry: ["loadFFmpeg"],
          on: {
            "ffmpeg.ready": {
              target: "detectingSilence",
            },
          },
        },

        done: {
          type: "final",
        },
      },

      onDone: {
        target: "done",
      },

      on: {
        cancel: "preparing",
      },
    },

    done: {
      on: {
        restart: {
          target: "preparing",
        },
      },
    },
  },
});
