import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlaybackVideo } from "./playback-video";

describe("PlaybackVideo URL refresh", () => {
  it("keeps an intentional seek to zero when the signed URL refreshes", () => {
    const onElement = vi.fn();
    const view = render(<PlaybackVideo url="https://f.test/first" onElement={onElement} />);
    const video = view.container.querySelector("video")!;
    video.currentTime = 12;
    fireEvent.timeUpdate(video);
    video.currentTime = 0;
    fireEvent.timeUpdate(video);
    fireEvent.seeked(video);
    view.rerender(<PlaybackVideo url="https://f.test/refreshed" onElement={onElement} />);
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(0);
  });

  it("still restores the current position after a source reload resets the element", () => {
    const onElement = vi.fn();
    const view = render(<PlaybackVideo url="https://f.test/first" onElement={onElement} />);
    const video = view.container.querySelector("video")!;
    video.currentTime = 12;
    fireEvent.timeUpdate(video);
    view.rerender(<PlaybackVideo url="https://f.test/refreshed" onElement={onElement} />);
    video.currentTime = 0;
    fireEvent.timeUpdate(video);
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(12);
  });
});
