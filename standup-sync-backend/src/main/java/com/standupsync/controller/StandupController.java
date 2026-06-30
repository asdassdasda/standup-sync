package com.standupsync.controller;

import com.standupsync.dto.CreateStandupDTO;
import com.standupsync.dto.Result;
import com.standupsync.dto.SubmitSpeechDTO;
import com.standupsync.service.StandupService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/standups")
public class StandupController {

    private final StandupService standupService;

    public StandupController(StandupService standupService) {
        this.standupService = standupService;
    }

    @GetMapping
    public Result<?> list(@RequestParam Long teamId) {
        return standupService.getStandupList(teamId);
    }

    @PostMapping
    public Result<?> create(@RequestBody CreateStandupDTO dto, Authentication auth) {
        return standupService.createStandup(dto, (Long) auth.getPrincipal());
    }

    @PostMapping("/{id}/start")
    public Result<?> start(@PathVariable Long id, Authentication auth) {
        return standupService.startStandup(id, (Long) auth.getPrincipal());
    }

    @GetMapping("/{id}")
    public Result<?> detail(@PathVariable Long id) {
        return standupService.getStandupDetail(id);
    }

    @PostMapping("/{id}/speeches")
    public Result<?> submitSpeech(@PathVariable Long id, @RequestBody SubmitSpeechDTO dto, Authentication auth) {
        return standupService.submitSpeech(id, (Long) auth.getPrincipal(), dto);
    }

    @PostMapping("/{id}/end")
    public Result<?> end(@PathVariable Long id, Authentication auth) {
        return standupService.endStandup(id, (Long) auth.getPrincipal());
    }

    @PostMapping("/{id}/paste")
    public Result<?> paste(@PathVariable Long id, @RequestBody String text) {
        return standupService.pasteChatLog(id, text);
    }

    @PostMapping("/{id}/summary/generate")
    public Result<?> generateSummary(@PathVariable Long id) {
        return standupService.generateAISummary(id);
    }

    @GetMapping("/{id}/summary")
    public Result<?> getSummary(@PathVariable Long id) {
        return standupService.getSummary(id);
    }

    @PutMapping("/summary/items/{itemId}")
    public Result<?> updateActionItem(@PathVariable Long itemId, @RequestParam(required = false) String content,
                                      @RequestParam(required = false) String priority, @RequestParam(required = false) Long assigneeId) {
        return standupService.updateActionItem(itemId, content, priority, assigneeId);
    }

    @PostMapping("/{id}/classify")
    public Result<?> classifyText(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String text = body.get("text");
        if (text == null || text.trim().isEmpty()) return Result.fail("文本为空");
        return standupService.classifyText(text);
    }
}
