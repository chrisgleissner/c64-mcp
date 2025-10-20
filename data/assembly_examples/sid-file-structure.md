# SID File Structure Reference (for RAG)

See `doc/sid-file-structure.md` for the complete explanation of PSID/RSID headers, fields, and playback behavior. This stub ensures the RAG index includes this topic and can surface it when generating or playing songs.

- Magic: `PSID` or `RSID`
- Key fields: version, dataOffset, loadAddress, initAddress, playAddress, songs, startSong, speed
- v2–v4 extras: flags (PAL/NTSC, 6581/8580), startPage/pageLength, second/third SID base
- Song length lookup: HVSC `Songlengths.md5` by MD5 of full file
