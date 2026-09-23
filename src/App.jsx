import { useEffect, useRef, useState } from "react"
import { useGoogleLogin } from "@react-oauth/google"
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Volume2,
  Search,
  Music2,
  HardDrive,
} from "lucide-react"

const localSongs = [
  {
    id: 1,
    title: "Test Song",
    artist: "Your Music",
    album: "My Album",
    src: "/test-song.mp3",
  },
  {
    id: 2,
    title: "Song Two",
    artist: "Your Music",
    album: "My Album",
    src: "/song-2.mp3",
  },
  {
    id: 3,
    title: "Song Three",
    artist: "Your Music",
    album: "My Album",
    src: "/song-3.mp3",
  },
]

const DRIVE_FOLDER_ID = import.meta.env.VITE_DRIVE_FOLDER_ID

const formatTime = (time) => {
  if (!Number.isFinite(time)) return "0:00"

  const minutes = Math.floor(time / 60)
  const seconds = Math.floor(time % 60)

  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

function App() {
  const audioRef = useRef(null)
  const objectUrlsRef = useRef({})

  const [accessToken, setAccessToken] = useState(null)
  const [driveSongs, setDriveSongs] = useState([])
  const [loadingDrive, setLoadingDrive] = useState(false)
  const [driveError, setDriveError] = useState("")

  const [currentSongIndex, setCurrentSongIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [isShuffle, setIsShuffle] = useState(false)
  const [isRepeat, setIsRepeat] = useState(false)
  const [search, setSearch] = useState("")

  const songs = accessToken ? driveSongs : localSongs
  const currentSong = songs[currentSongIndex]

  // -----------------------------
  // GOOGLE LOGIN
  // -----------------------------

  const login = useGoogleLogin({
    scope: "https://www.googleapis.com/auth/drive.readonly",

    onSuccess: (tokenResponse) => {
      console.log("Google login successful")
      setAccessToken(tokenResponse.access_token)
      setDriveError("")
    },

    onError: () => {
      setDriveError("Google login failed")
    },
  })

  // -----------------------------
  // FETCH SONGS FROM GOOGLE DRIVE
  // -----------------------------

  useEffect(() => {
    if (!accessToken) return

    const fetchDriveSongs = async () => {
      setLoadingDrive(true)
      setDriveError("")

      try {
        const query = encodeURIComponent(
          `'${DRIVE_FOLDER_ID}' in parents and trashed = false`
        )

        const url =
          `https://www.googleapis.com/drive/v3/files` +
          `?q=${query}` +
          `&fields=files(id,name,mimeType,size,modifiedTime)` +
          `&orderBy=name`

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(errorText)
          throw new Error("Could not access Google Drive")
        }

        const data = await response.json()

        const audioFiles = (data.files || []).filter((file) => {
          const name = file.name.toLowerCase()

          return (
            file.mimeType?.startsWith("audio/") ||
            name.endsWith(".mp3") ||
            name.endsWith(".m4a") ||
            name.endsWith(".wav") ||
            name.endsWith(".flac") ||
            name.endsWith(".ogg")
          )
        })

        const formattedSongs = audioFiles.map((file) => ({
          id: file.id,
          title: file.name.replace(/\.[^/.]+$/, ""),
          artist: "Google Drive",
          album: "My Music",
          driveId: file.id,
          mimeType: file.mimeType,
        }))

        setDriveSongs(formattedSongs)
        setCurrentSongIndex(0)
      } catch (error) {
        console.error(error)
        setDriveError(
          "Drive songs load nahi ho paaye. Console check karo."
        )
      } finally {
        setLoadingDrive(false)
      }
    }

    fetchDriveSongs()
  }, [accessToken])

  // -----------------------------
  // DOWNLOAD / PLAY DRIVE SONG
  // -----------------------------

  const getDriveAudioUrl = async (song) => {
    if (objectUrlsRef.current[song.id]) {
      return objectUrlsRef.current[song.id]
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${song.driveId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error("Song download failed")
    }

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)

    objectUrlsRef.current[song.id] = objectUrl

    return objectUrl
  }

  // -----------------------------
  // LOAD CURRENT SONG
  // -----------------------------

  useEffect(() => {
    const audio = audioRef.current

    if (!audio || !currentSong) return

    let cancelled = false

    const loadSong = async () => {
      setCurrentTime(0)
      setDuration(0)

      try {
        let src = currentSong.src

        if (currentSong.driveId) {
          src = await getDriveAudioUrl(currentSong)
        }

        if (cancelled) return

        audio.src = src
        audio.volume = volume
        audio.load()

        if (isPlaying) {
          await audio.play()
        }
      } catch (error) {
        console.error("Playback failed:", error)
        setIsPlaying(false)
      }
    }

    loadSong()

    return () => {
      cancelled = true
    }
  }, [currentSongIndex, driveSongs])

  // -----------------------------
  // AUDIO EVENTS
  // -----------------------------

  useEffect(() => {
    const audio = audioRef.current

    if (!audio) return

    const updateTime = () => {
      setCurrentTime(audio.currentTime)
    }

    const updateDuration = () => {
      setDuration(audio.duration)
    }

    const handleEnded = () => {
      if (isRepeat) {
        audio.currentTime = 0
        audio.play()
        return
      }

      playNext()
    }

    audio.addEventListener("timeupdate", updateTime)
    audio.addEventListener("loadedmetadata", updateDuration)
    audio.addEventListener("ended", handleEnded)

    return () => {
      audio.removeEventListener("timeupdate", updateTime)
      audio.removeEventListener("loadedmetadata", updateDuration)
      audio.removeEventListener("ended", handleEnded)
    }
  }, [isRepeat, isShuffle, songs.length])

  // -----------------------------
  // VOLUME
  // -----------------------------

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume])

  // -----------------------------
  // PLAY / PAUSE
  // -----------------------------

  const togglePlay = async () => {
    const audio = audioRef.current

    if (!audio || !currentSong) return

    try {
      if (isPlaying) {
        audio.pause()
        setIsPlaying(false)
      } else {
        await audio.play()
        setIsPlaying(true)
      }
    } catch (error) {
      console.error(error)
    }
  }

  // -----------------------------
  // NEXT
  // -----------------------------

  const playNext = () => {
    if (!songs.length) return

    if (isShuffle && songs.length > 1) {
      let randomIndex

      do {
        randomIndex = Math.floor(Math.random() * songs.length)
      } while (randomIndex === currentSongIndex)

      setCurrentSongIndex(randomIndex)
      return
    }

    setCurrentSongIndex((prev) => (prev + 1) % songs.length)
  }

  // -----------------------------
  // PREVIOUS
  // -----------------------------

  const playPrevious = () => {
    const audio = audioRef.current

    if (!audio) return

    if (audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }

    setCurrentSongIndex(
      (prev) => (prev - 1 + songs.length) % songs.length
    )
  }

  // -----------------------------
  // SELECT SONG
  // -----------------------------

  const selectSong = (index) => {
    setCurrentSongIndex(index)
    setIsPlaying(true)
  }

  // -----------------------------
  // SEARCH
  // -----------------------------

  const filteredSongs = songs.filter((song) => {
    const text = `${song.title} ${song.artist} ${song.album}`.toLowerCase()

    return text.includes(search.toLowerCase())
  })

  // -----------------------------
  // CLEAN OBJECT URLS
  // -----------------------------

  useEffect(() => {
    return () => {
      Object.values(objectUrlsRef.current).forEach((url) => {
        URL.revokeObjectURL(url)
      })
    }
  }, [])

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-black text-white">
      <audio ref={audioRef} />

      <main className="mx-auto w-full min-w-0 max-w-md px-4 pb-40">

        {/* HEADER */}

        <header className="flex items-center justify-between py-5">
          <div>
            <p className="text-sm text-zinc-400">Your music</p>

            <h1 className="text-2xl font-bold">
              My Music 🎵
            </h1>
          </div>

          <Search size={22} />
        </header>

        {/* GOOGLE DRIVE */}

        {!accessToken ? (
          <button
            onClick={() => login()}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 font-semibold text-black"
          >
            <HardDrive size={19} />
            Connect Google Drive
          </button>
        ) : (
          <div className="mb-5 rounded-2xl bg-zinc-900 px-4 py-3">
            <div className="flex items-center gap-2">
              <HardDrive size={18} />
              <span className="font-medium">
                Google Drive Connected
              </span>
            </div>

            <p className="mt-1 text-xs text-zinc-400">
              {loadingDrive
                ? "Loading your music..."
                : `${driveSongs.length} song(s) found`}
            </p>
          </div>
        )}

        {driveError && (
          <div className="mb-4 rounded-xl bg-red-950 px-4 py-3 text-sm text-red-300">
            {driveError}
          </div>
        )}

        {/* SEARCH */}

        <div className="mb-5">
          <input
            type="text"
            placeholder="Search songs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white outline-none placeholder:text-zinc-500"
          />
        </div>

        {/* SONGS */}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {accessToken ? "My Drive Songs" : "Your Songs"}
            </h2>

            <span className="text-sm text-zinc-500">
              {filteredSongs.length}
            </span>
          </div>

          {loadingDrive ? (
            <div className="rounded-2xl bg-zinc-900 p-6 text-center text-zinc-400">
              Loading songs from Drive...
            </div>
          ) : filteredSongs.length === 0 ? (
            <div className="rounded-2xl bg-zinc-900 p-6 text-center">
              <Music2
                size={35}
                className="mx-auto mb-3 text-zinc-500"
              />

              <p className="font-medium">
                No songs found
              </p>

              <p className="mt-1 text-sm text-zinc-500">
                Put MP3 files inside your My Music Drive folder.
              </p>
            </div>
          ) : (
            <div className="grid w-full min-w-0 grid-cols-2 gap-3">
              {filteredSongs.map((song) => {
                const originalIndex = songs.findIndex(
                  (item) => item.id === song.id
                )

                const active =
                  songs[currentSongIndex]?.id === song.id

                return (
                  <button
                    key={song.id}
                    onClick={() => selectSong(originalIndex)}
                    className={`min-w-0 overflow-hidden rounded-2xl p-3 text-left ${
                      active
                        ? "bg-zinc-700"
                        : "bg-zinc-900"
                    }`}
                  >
                    <div className="mb-3 flex aspect-square items-center justify-center rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-950">
                      <Music2 size={42} className="text-zinc-400" />
                    </div>

                    <p className="truncate font-semibold">
                      {song.title}
                    </p>

                    <p className="truncate text-xs text-zinc-500">
                      {song.artist}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* NOW PLAYING */}

        {currentSong && (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">
              Now Playing
            </h2>

            <div className="rounded-3xl bg-zinc-900 p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-700 to-zinc-950">
                  <Music2 size={32} className="text-zinc-400" />
                </div>

                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">
                    {currentSong.title}
                  </p>

                  <p className="truncate text-sm text-zinc-400">
                    {currentSong.artist}
                  </p>
                </div>
              </div>

              {/* PROGRESS */}

              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={(e) => {
                  const time = Number(e.target.value)

                  if (audioRef.current) {
                    audioRef.current.currentTime = time
                  }

                  setCurrentTime(time)
                }}
                className="mt-6 w-full"
              />

              <div className="flex justify-between text-xs text-zinc-500">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>

              {/* CONTROLS */}

              <div className="mt-5 flex items-center justify-between">
                <button
                  onClick={() => setIsShuffle(!isShuffle)}
                  className={
                    isShuffle
                      ? "text-white"
                      : "text-zinc-500"
                  }
                >
                  <Shuffle size={20} />
                </button>

                <button onClick={playPrevious}>
                  <SkipBack size={25} />
                </button>

                <button
                  onClick={togglePlay}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black"
                >
                  {isPlaying ? (
                    <Pause size={25} />
                  ) : (
                    <Play size={25} fill="currentColor" />
                  )}
                </button>

                <button onClick={playNext}>
                  <SkipForward size={25} />
                </button>

                <button
                  onClick={() => setIsRepeat(!isRepeat)}
                  className={
                    isRepeat
                      ? "text-white"
                      : "text-zinc-500"
                  }
                >
                  <Repeat size={20} />
                </button>
              </div>

              {/* VOLUME */}

              <div className="mt-5 flex items-center gap-3">
                <Volume2 size={18} className="text-zinc-400" />

                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) =>
                    setVolume(Number(e.target.value))
                  }
                  className="w-full"
                />
              </div>
            </div>
          </section>
        )}
      </main>

      {/* MINI PLAYER */}

      {currentSong && (
        <div className="fixed bottom-16 left-0 right-0 z-20 px-3">
          <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-3 backdrop-blur">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-800">
              <Music2 size={20} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {currentSong.title}
              </p>

              <p className="truncate text-xs text-zinc-500">
                {currentSong.artist}
              </p>
            </div>

            <button
              onClick={togglePlay}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black"
            >
              {isPlaying ? (
                <Pause size={18} />
              ) : (
                <Play size={18} fill="currentColor" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM NAV */}

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-900 bg-black/95">
        <div className="mx-auto flex max-w-md items-center justify-around py-3 text-xs text-zinc-400">
          <div className="flex flex-col items-center gap-1 text-white">
            <Music2 size={20} />
            Home
          </div>

          <div className="flex flex-col items-center gap-1">
            <Search size={20} />
            Search
          </div>

          <div className="flex flex-col items-center gap-1">
            <Repeat size={20} />
            Liked
          </div>

          <div className="flex flex-col items-center gap-1">
            <HardDrive size={20} />
            Library
          </div>
        </div>
      </nav>
    </div>
  )
}

export default App